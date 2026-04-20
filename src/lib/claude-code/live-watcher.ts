import { readdirSync, statSync, openSync, readSync, closeSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../util/logger.ts";
import { estimateCost, refreshPricing } from "./pricing.ts";
import type { EventBus } from "../orchestrator/events.ts";
import type { LogLine, ModelId, SessionSnapshot, SessionState } from "../shared/types.ts";

const log = createLogger("cc-live");

const ROOT = resolve(homedir(), ".claude", "projects");
const POLL_MS = 3_000;
const ACTIVE_WINDOW_MS = 120_000;
const GONE_AFTER_MS = 90_000;
const MAX_LOG_LINES = 80;

const MODEL_ALIAS: Record<string, ModelId> = {
  "claude-opus-4-7": "opus-4.7",
  "claude-opus-4-6": "opus-4.7",
  "claude-opus-4-5": "opus-4.7",
  "claude-opus-4-5-20251101": "opus-4.7",
  "claude-sonnet-4-6": "sonnet-4.6",
  "claude-sonnet-4-5": "sonnet-4.6",
  "claude-haiku-4-5-20251001": "haiku-4.5",
  "claude-haiku-4-5": "haiku-4.5",
};

interface Totals {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreate5m: number;
  cacheCreate1h: number;
}

interface Tracked {
  readonly file: string;
  readonly id: string;
  offset: number;
  lastMtime: number;
  lastSeen: number;
  snapshot: SessionSnapshot;
  totals: Totals;
  rawModel?: string;
  seenMsgKeys: Set<string>;
}

export class LiveWatcher {
  private readonly tracked = new Map<string, Tracked>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    private readonly bus: EventBus,
    private readonly isInternallyOwned?: (cwd: string | undefined) => boolean,
  ) {}

  start(): void {
    if (this.timer) return;
    void refreshPricing().catch(() => { /* fallback used */ });
    this.timer = setInterval(() => void this.tick(), POLL_MS);
    void this.tick();
    log.info("live watcher started", { root: ROOT, pollMs: POLL_MS });
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const t of this.tracked.values()) this.emitGone(t);
    this.tracked.clear();
  }

  listSnapshots(): SessionSnapshot[] {
    return Array.from(this.tracked.values()).map((t) => t.snapshot);
  }

  forget(id: string): boolean {
    for (const [file, t] of this.tracked) {
      if (t.id !== id) continue;
      this.emitGone(t);
      this.tracked.delete(file);
      return true;
    }
    return false;
  }

  private async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const now = Date.now();
      const candidates = this.findActive(now);
      const seen = new Set<string>();
      for (const c of candidates) {
        seen.add(c.file);
        const existing = this.tracked.get(c.file);
        if (!existing) this.trackNew(c, now);
        else this.tail(existing, c.mtime, now);
      }
      for (const [file, t] of this.tracked) {
        if (!seen.has(file) && now - t.lastMtime > GONE_AFTER_MS) {
          this.emitGone(t);
          this.tracked.delete(file);
        }
      }
    } finally {
      this.ticking = false;
    }
  }

  private findActive(now: number): { file: string; mtime: number; size: number }[] {
    const out: { file: string; mtime: number; size: number }[] = [];
    let dirs: string[] = [];
    try { dirs = readdirSync(ROOT).filter((d) => !d.startsWith(".")); }
    catch { return out; }
    for (const d of dirs) {
      const full = join(ROOT, d);
      let files: string[];
      try { files = readdirSync(full).filter((f) => f.endsWith(".jsonl")); }
      catch { continue; }
      for (const f of files) {
        const path = join(full, f);
        try {
          const st = statSync(path);
          const age = now - st.mtimeMs;
          if (age < ACTIVE_WINDOW_MS) out.push({ file: path, mtime: st.mtimeMs, size: st.size });
        } catch { /* skip */ }
      }
    }
    return out;
  }

  private trackNew(c: { file: string; mtime: number; size: number }, now: number): void {
    const text = safeRead(c.file);
    if (!text) return;
    const base = emptySnapshot(c.file);
    const totals: Totals = { input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0 };
    const seenKeys = new Set<string>();
    const acc = new Accumulator(base, totals, seenKeys);
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      acc.apply(line);
    }
    const snap = acc.finalize(now);
    if (this.isInternallyOwned?.(snap.cwd)) {
      log.info("skipping internally-owned session", { id: snap.id, cwd: snap.cwd });
      return;
    }
    const t: Tracked = {
      file: c.file,
      id: snap.id,
      offset: Buffer.byteLength(text, "utf8"),
      lastMtime: c.mtime,
      lastSeen: now,
      snapshot: snap,
      totals,
      rawModel: acc.rawModel,
      seenMsgKeys: seenKeys,
    };
    this.tracked.set(c.file, t);
    this.bus.emit({ kind: "init", at: now, snapshot: snap });
    for (const line of acc.recentLogs()) {
      this.bus.emit({ kind: "log", at: now, id: snap.id, line });
    }
    log.info("tracking new session", { id: snap.id, cwd: snap.cwd });
  }

  private tail(t: Tracked, mtime: number, now: number): void {
    if (this.isInternallyOwned?.(t.snapshot.cwd)) {
      log.info("dropping tracked session — now internally owned", { id: t.id, cwd: t.snapshot.cwd });
      this.bus.emit({ kind: "gone", at: now, id: t.id });
      this.tracked.delete(t.file);
      return;
    }
    if (mtime === t.lastMtime) {
      const idleMs = now - t.lastSeen;
      if (idleMs > 30_000 && t.snapshot.state !== "idle" && t.snapshot.state !== "done" && t.snapshot.state !== "error") {
        this.patch(t, { state: "idle", tool: null }, now);
      }
      return;
    }
    const chunk = readFromOffset(t.file, t.offset);
    if (!chunk) { t.lastMtime = mtime; return; }
    const text = chunk.text;
    const parts = text.split("\n");
    const partial = parts.pop() ?? "";
    const consumed = text.length - Buffer.byteLength(partial, "utf8");
    t.offset += consumed;
    t.lastMtime = mtime;
    t.lastSeen = now;

    const acc = new Accumulator(t.snapshot, t.totals, t.seenMsgKeys, t.rawModel);
    const newLogs: LogLine[] = [];
    for (const line of parts) {
      if (!line.trim()) continue;
      const before = acc.snap;
      acc.apply(line);
      const delta = acc.popNewLogs();
      for (const d of delta) newLogs.push(d);
      if (before !== acc.snap) { /* updated */ }
    }
    t.rawModel = acc.rawModel;
    const updated = acc.finalize(now);
    const diff = snapshotDiff(t.snapshot, updated);
    const prevState = t.snapshot.state;
    t.snapshot = updated;
    if (Object.keys(diff).length > 0) this.bus.emit({ kind: "patch", at: now, id: t.id, patch: diff });
    if (prevState !== updated.state) {
      this.bus.emit({ kind: "transition", at: now, id: t.id, from: prevState, to: updated.state });
    }
    for (const line of newLogs) this.bus.emit({ kind: "log", at: now, id: t.id, line });
  }

  private patch(t: Tracked, p: Partial<SessionSnapshot>, now: number): void {
    const next = { ...t.snapshot, ...p } as SessionSnapshot;
    const prevState = t.snapshot.state;
    t.snapshot = next;
    this.bus.emit({ kind: "patch", at: now, id: t.id, patch: p });
    if (p.state && p.state !== prevState) {
      this.bus.emit({ kind: "transition", at: now, id: t.id, from: prevState, to: p.state });
    }
  }

  private emitGone(t: Tracked): void {
    const now = Date.now();
    if (t.snapshot.state !== "done" && t.snapshot.state !== "error") {
      this.patch(t, { state: "done", endedAt: now, durationMs: now - t.snapshot.startedAt }, now);
    }
    this.bus.emit({ kind: "gone", at: now, id: t.id });
  }
}

function emptySnapshot(file: string): SessionSnapshot {
  const fullId = (file.split("/").pop() ?? "unknown").replace(/\.jsonl$/, "");
  const id = "cli_" + fullId.slice(0, 12);
  return {
    id,
    project: "claude-code",
    name: "Claude Code session",
    model: "opus-4.7",
    state: "running",
    tool: null,
    elapsed: "00:00",
    toolsUsed: 0,
    todos: 0,
    todosDone: 0,
    cost: 0,
    startedAt: Date.now(),
    logs: [],
    inputTokens: 0,
    outputTokens: 0,
    resumeSessionId: fullId,
  };
}

class Accumulator {
  snap: SessionSnapshot;
  private logs: LogLine[] = [];
  private newSinceLastPop = 0;
  private totals: Totals;
  private seenMsgKeys: Set<string>;
  rawModel: string | undefined;

  constructor(initial: SessionSnapshot, totals: Totals, seenMsgKeys: Set<string>, rawModel?: string) {
    this.snap = { ...initial, logs: initial.logs.slice() };
    this.logs = initial.logs.slice();
    this.totals = totals;
    this.seenMsgKeys = seenMsgKeys;
    this.rawModel = rawModel;
  }

  apply(line: string): void {
    let rec: Record<string, unknown>;
    try { rec = JSON.parse(line) as Record<string, unknown>; }
    catch { return; }

    if (typeof rec.cwd === "string" && !this.snap.cwd) this.snap = { ...this.snap, cwd: rec.cwd, project: lastSegment(rec.cwd) };
    if (typeof rec.sessionId === "string" && !this.snap.id.startsWith("cli_") === false && this.snap.id.length < 20) {
      this.snap = { ...this.snap, id: `cli_${rec.sessionId.slice(0, 12)}`, resumeSessionId: rec.sessionId };
    }
    if (typeof rec.gitBranch === "string" && rec.gitBranch) this.snap = { ...this.snap, branch: rec.gitBranch };

    const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : NaN;
    if (!Number.isNaN(ts)) {
      if (ts < this.snap.startedAt || !this.snap.startedAt) this.snap = { ...this.snap, startedAt: ts };
    }

    const type = rec.type;
    if (type === "assistant") {
      const msg = rec.message as Record<string, unknown> | undefined;
      if (msg) {
        if (typeof msg.model === "string") {
          this.rawModel = msg.model;
          const alias = MODEL_ALIAS[msg.model];
          if (alias) this.snap = { ...this.snap, model: alias };
        }
        const usage = msg.usage as Record<string, unknown> | undefined;
        const msgId = typeof msg.id === "string" ? msg.id : null;
        const reqId = typeof rec.requestId === "string" ? rec.requestId : null;
        const key = msgId && reqId ? `${msgId}:${reqId}` : null;
        const alreadySeen = key ? this.seenMsgKeys.has(key) : false;
        if (usage && !alreadySeen) {
          if (key) this.seenMsgKeys.add(key);
          this.totals.input        += numOr0(usage.input_tokens);
          this.totals.output       += numOr0(usage.output_tokens);
          this.totals.cacheRead    += numOr0(usage.cache_read_input_tokens);
          const cc = usage.cache_creation as Record<string, unknown> | undefined;
          if (cc) {
            this.totals.cacheCreate5m += numOr0(cc.ephemeral_5m_input_tokens);
            this.totals.cacheCreate1h += numOr0(cc.ephemeral_1h_input_tokens);
          } else {
            this.totals.cacheCreate5m += numOr0(usage.cache_creation_input_tokens);
          }
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
              this.snap = { ...this.snap, toolsUsed: this.snap.toolsUsed + 1 };
            } else if (block.type === "text" && typeof block.text === "string") {
              for (const ln of block.text.split("\n")) {
                const v = ln.trim();
                if (v) this.pushLog({ t: "plain", v: v.slice(0, 400) });
              }
            }
          }
          if (toolName) this.snap = { ...this.snap, state: "tool_use", tool: toolName };
          else if (stopReason === "end_turn") this.snap = { ...this.snap, state: "idle", tool: null };
          else this.snap = { ...this.snap, state: "running" };
        }
      }
    } else if (type === "user") {
      const msg = rec.message as Record<string, unknown> | undefined;
      if (!msg) return;
      const content = msg.content;
      let isToolResult = false;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (!b || typeof b !== "object") continue;
          const block = b as Record<string, unknown>;
          if (block.type === "tool_result") { isToolResult = true; continue; }
          if (block.type === "text" && typeof block.text === "string") {
            if (!this.snap.prompt) this.snap = { ...this.snap, prompt: block.text.slice(0, 400), name: block.text.slice(0, 80) || this.snap.name };
            this.pushLog({ t: "gt", v: "› " + block.text.slice(0, 260) });
          }
        }
      } else if (typeof content === "string") {
        if (!this.snap.prompt) this.snap = { ...this.snap, prompt: content.slice(0, 400), name: content.slice(0, 80) || this.snap.name };
        this.pushLog({ t: "gt", v: "› " + content.slice(0, 260) });
      }
      this.snap = { ...this.snap, state: isToolResult ? "running" : "running" };
    }
  }

  finalize(now: number): SessionSnapshot {
    const elapsed = fmtElapsed(now - this.snap.startedAt);
    const cost = estimateCost(this.rawModel ?? this.snap.model, {
      input: this.totals.input,
      output: this.totals.output,
      cacheRead: this.totals.cacheRead,
      cacheCreate5m: this.totals.cacheCreate5m,
      cacheCreate1h: this.totals.cacheCreate1h,
    });
    return {
      ...this.snap,
      elapsed,
      cost,
      inputTokens: this.totals.input,
      outputTokens: this.totals.output,
      logs: this.logs.slice(-MAX_LOG_LINES),
    };
  }

  recentLogs(): LogLine[] { return this.logs.slice(-MAX_LOG_LINES); }

  popNewLogs(): LogLine[] {
    const delta = this.logs.slice(this.logs.length - this.newSinceLastPop);
    this.newSinceLastPop = 0;
    return delta;
  }

  private pushLog(line: LogLine): void {
    this.logs.push(line);
    this.newSinceLastPop++;
  }
}

function safeRead(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}

function readFromOffset(path: string, offset: number): { text: string } | null {
  let fd = -1;
  try {
    fd = openSync(path, "r");
    const st = statSync(path);
    const remaining = Math.max(0, st.size - offset);
    if (remaining === 0) return { text: "" };
    const buf = Buffer.alloc(remaining);
    readSync(fd, buf, 0, remaining, offset);
    return { text: buf.toString("utf8") };
  } catch { return null; }
  finally { if (fd >= 0) try { closeSync(fd); } catch { /* ignore */ } }
}

function snapshotDiff(a: SessionSnapshot, b: SessionSnapshot): Partial<SessionSnapshot> {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(b) as (keyof SessionSnapshot)[]) {
    if (k === "logs") continue;
    if (a[k] !== b[k]) patch[k as string] = b[k];
  }
  return patch as Partial<SessionSnapshot>;
}

function numOr0(v: unknown): number { return typeof v === "number" && Number.isFinite(v) ? v : 0; }
function lastSegment(p: string): string { const parts = p.split("/").filter(Boolean); return parts[parts.length - 1] ?? p; }
function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
  return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
