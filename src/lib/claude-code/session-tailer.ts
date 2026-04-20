import { readdirSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../util/logger.ts";
import { estimateCost, refreshPricing } from "./pricing.ts";
import type { ModelId, TodoItem } from "../shared/types.ts";

const log = createLogger("session-tailer");

const ROOT = resolve(homedir(), ".claude", "projects");
const POLL_MS = 2_000;

const MODEL_ALIAS: Record<string, ModelId> = {
  "claude-opus-4-7": "opus-4.7",
  "claude-opus-4-6": "opus-4.7",
  "claude-opus-4-5": "opus-4.7",
  "claude-sonnet-4-6": "sonnet-4.6",
  "claude-sonnet-4-5": "sonnet-4.6",
  "claude-haiku-4-5-20251001": "haiku-4.5",
  "claude-haiku-4-5": "haiku-4.5",
};

export interface TailPatch {
  readonly cost?: number;
  readonly tool?: string | null;
  readonly toolsUsed?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly model?: ModelId;
  readonly resumeSessionId?: string;
  readonly todoList?: readonly TodoItem[];
  readonly todos?: number;
  readonly todosDone?: number;
}

export class SessionTailer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private file: string | null = null;
  private offset = 0;
  private totals = { input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0 };
  private seenMsgKeys = new Set<string>();
  private rawModel: string | undefined;
  private toolsUsed = 0;
  private tool: string | null = null;
  private model: ModelId | undefined;
  private resumeSessionId: string | undefined;
  private todoList: TodoItem[] = [];
  private lastEmitted: TailPatch = {};
  private stopped = false;

  constructor(
    private readonly cwd: string,
    private readonly startedAt: number,
    private readonly onPatch: (p: TailPatch) => void,
  ) {}

  start(): void {
    if (this.timer) return;
    log.info("tailer start", { cwd: this.cwd, startedAt: this.startedAt });
    void refreshPricing().catch(() => { /* fallback */ });
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    void this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.stopped) return;
    const prevFile = this.file;
    const latest = this.findLatestFile();
    if (!latest) return;
    if (latest !== prevFile) {
      log.info("tailing JSONL", { cwd: this.cwd, file: latest, switchedFrom: prevFile });
      this.file = latest;
      this.offset = 0;
      this.totals = { input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0 };
      this.seenMsgKeys = new Set();
      this.toolsUsed = 0;
      this.tool = null;
      this.todoList = [];
      this.lastEmitted = {};
    }
    const file = this.file;
    if (!file) return;
    let size = 0;
    try { size = statSync(file).size; } catch { this.file = null; return; }
    if (size <= this.offset) return;
    const chunk = readFromOffset(file, this.offset);
    if (!chunk) return;
    const parts = chunk.split("\n");
    const partial = parts.pop() ?? "";
    const consumed = chunk.length - Buffer.byteLength(partial, "utf8");
    this.offset += consumed;
    let changed = false;
    for (const line of parts) {
      if (!line.trim()) continue;
      if (this.apply(line)) changed = true;
    }
    if (changed) this.emit();
  }

  private findLatestFile(): string | null {
    const dirs = this.candidateDirs();
    let best: { path: string; mtime: number } | null = null;
    for (const d of dirs) {
      let files: string[];
      try { files = readdirSync(d).filter((f) => f.endsWith(".jsonl")); }
      catch { continue; }
      for (const f of files) {
        const p = join(d, f);
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.mtimeMs < this.startedAt - 60_000) continue;
        if (!this.matchesCwd(p)) continue;
        if (!best || st.mtimeMs > best.mtime) best = { path: p, mtime: st.mtimeMs };
      }
    }
    return best?.path ?? null;
  }

  private candidateDirs(): string[] {
    const encoded = this.cwd.replace(/\//g, "-");
    const primary = join(ROOT, encoded);
    const out: string[] = [];
    try { if (statSync(primary).isDirectory()) out.push(primary); } catch { /* ignore */ }
    try {
      for (const d of readdirSync(ROOT)) {
        if (d.startsWith(".")) continue;
        const full = join(ROOT, d);
        if (out.includes(full)) continue;
        out.push(full);
      }
    } catch { /* ignore */ }
    return out;
  }

  private matchesCwd(path: string): boolean {
    try {
      const fd = openSync(path, "r");
      try {
        const buf = Buffer.alloc(4096);
        const n = readSync(fd, buf, 0, 4096, 0);
        const head = buf.toString("utf8", 0, n);
        for (const line of head.split("\n")) {
          if (!line.trim()) continue;
          try {
            const rec = JSON.parse(line) as Record<string, unknown>;
            if (typeof rec.cwd === "string") return rec.cwd === this.cwd;
          } catch { /* partial line, skip */ }
        }
      } finally { try { closeSync(fd); } catch { /* ignore */ } }
    } catch { /* ignore */ }
    return false;
  }

  private apply(line: string): boolean {
    let rec: Record<string, unknown>;
    try { rec = JSON.parse(line) as Record<string, unknown>; } catch { return false; }
    let changed = false;
    if (typeof rec.sessionId === "string" && rec.sessionId !== this.resumeSessionId) {
      this.resumeSessionId = rec.sessionId;
      changed = true;
    }
    const type = rec.type;
    if (type === "assistant") {
      const msg = rec.message as Record<string, unknown> | undefined;
      if (!msg) return changed;
      if (typeof msg.model === "string") {
        this.rawModel = msg.model;
        const alias = MODEL_ALIAS[msg.model];
        if (alias && alias !== this.model) { this.model = alias; changed = true; }
      }
      const usage = msg.usage as Record<string, unknown> | undefined;
      const msgId = typeof msg.id === "string" ? msg.id : null;
      const reqId = typeof rec.requestId === "string" ? rec.requestId : null;
      const key = msgId && reqId ? `${msgId}:${reqId}` : null;
      if (usage && (!key || !this.seenMsgKeys.has(key))) {
        if (key) this.seenMsgKeys.add(key);
        this.totals.input        += num(usage.input_tokens);
        this.totals.output       += num(usage.output_tokens);
        this.totals.cacheRead    += num(usage.cache_read_input_tokens);
        const cc = usage.cache_creation as Record<string, unknown> | undefined;
        if (cc) {
          this.totals.cacheCreate5m += num(cc.ephemeral_5m_input_tokens);
          this.totals.cacheCreate1h += num(cc.ephemeral_1h_input_tokens);
        } else {
          this.totals.cacheCreate5m += num(usage.cache_creation_input_tokens);
        }
        changed = true;
      }
      const stopReason = msg.stop_reason;
      const content = msg.content;
      if (Array.isArray(content)) {
        let toolName: string | null = null;
        for (const b of content) {
          if (!b || typeof b !== "object") continue;
          const block = b as Record<string, unknown>;
          if (block.type === "tool_use" && typeof block.name === "string") {
            toolName = block.name;
            this.toolsUsed += 1;
            if (block.name === "TodoWrite") this.captureTodos(block.input);
            changed = true;
          }
        }
        if (toolName && toolName !== this.tool) { this.tool = toolName; changed = true; }
        else if (stopReason === "end_turn" && this.tool !== null) { this.tool = null; changed = true; }
      }
    } else if (type === "user") {
      const msg = rec.message as Record<string, unknown> | undefined;
      if (!msg) return changed;
      const content = msg.content;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (!b || typeof b !== "object") continue;
          const block = b as Record<string, unknown>;
          if (block.type === "tool_result" && this.tool !== null) { this.tool = null; changed = true; }
        }
      }
    }
    return changed;
  }

  private captureTodos(input: unknown): void {
    if (!input || typeof input !== "object") return;
    const raw = (input as Record<string, unknown>).todos;
    if (!Array.isArray(raw)) return;
    const items: TodoItem[] = [];
    for (const t of raw) {
      if (!t || typeof t !== "object") continue;
      const r = t as Record<string, unknown>;
      const status = r.status;
      const content = typeof r.content === "string" ? r.content : typeof r.text === "string" ? r.text : "";
      if (!content) continue;
      if (status === "completed") items.push({ status: "done", text: content });
      else if (status === "in_progress") items.push({ status: "active", text: content });
      else items.push({ status: "todo", text: content });
    }
    this.todoList = items;
  }

  private emit(): void {
    const cost = estimateCost(this.rawModel ?? this.model ?? "", {
      input: this.totals.input,
      output: this.totals.output,
      cacheRead: this.totals.cacheRead,
      cacheCreate5m: this.totals.cacheCreate5m,
      cacheCreate1h: this.totals.cacheCreate1h,
    });
    const done = this.todoList.filter((t) => t.status === "done").length;
    const patch: TailPatch = {
      cost,
      tool: this.tool,
      toolsUsed: this.toolsUsed,
      inputTokens: this.totals.input,
      outputTokens: this.totals.output,
      model: this.model,
      resumeSessionId: this.resumeSessionId,
      todoList: this.todoList,
      todos: this.todoList.length,
      todosDone: done,
    };
    const diff: TailPatch = {};
    let any = false;
    for (const k of Object.keys(patch) as (keyof TailPatch)[]) {
      if (patch[k] === undefined) continue;
      if (patch[k] !== this.lastEmitted[k]) {
        (diff as Record<string, unknown>)[k as string] = patch[k];
        any = true;
      }
    }
    if (!any) return;
    this.lastEmitted = patch;
    log.info("tailer emit", { cost, toolsUsed: this.toolsUsed, tool: this.tool, todos: this.todoList.length });
    this.onPatch(diff);
  }
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function readFromOffset(path: string, offset: number): string | null {
  let fd = -1;
  try {
    fd = openSync(path, "r");
    const st = statSync(path);
    const remaining = Math.max(0, st.size - offset);
    if (remaining === 0) return "";
    const buf = Buffer.alloc(remaining);
    readSync(fd, buf, 0, remaining, offset);
    return buf.toString("utf8");
  } catch { return null; }
  finally { if (fd >= 0) try { closeSync(fd); } catch { /* ignore */ } }
}
