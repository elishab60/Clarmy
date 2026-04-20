import { query, type Options, type PermissionResult, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { createLogger } from "../util/logger.ts";
import { RingBuffer } from "../util/ring-buffer.ts";
import { findClaudeCliPath } from "../claude-code/history.ts";
import { estimateCost, refreshPricing } from "../claude-code/pricing.ts";
import type { EventBus } from "./events.ts";
import { reduce, initialSnapshot, type StateAction } from "./state-machine.ts";
import type { SessionEvent, SessionSnapshot, SpawnConfig, PendingApproval, LogLine, DiffRow } from "../shared/types.ts";

const log = createLogger("session");

const MODEL_MAP: Record<string, string> = {
  "opus-4.7": "claude-opus-4-7",
  "sonnet-4.6": "claude-sonnet-4-6",
  "haiku-4.5": "claude-haiku-4-5-20251001",
};

type Deferred = {
  resolve: (r: PermissionResult) => void;
  reject: (e: Error) => void;
};

export class SessionRunner {
  private snapshot: SessionSnapshot;
  private readonly pending = new Map<string, Deferred>();
  private readonly logs = new RingBuffer<LogLine>(500);
  private readonly abort = new AbortController();
  private running = false;
  private rawModel: string | undefined;
  private usage = { input: 0, output: 0, cacheRead: 0, cacheCreate5m: 0, cacheCreate1h: 0 };
  private seenMsgKeys = new Set<string>();

  constructor(
    public readonly id: string,
    private readonly bus: EventBus,
    private readonly config: SpawnConfig,
  ) {
    this.snapshot = initialSnapshot({
      type: "system.init",
      id,
      project: config.project,
      name: config.name,
      model: config.model,
      startedAt: Date.now(),
      cwd: config.cwd,
      branch: config.branch,
      prompt: config.prompt,
    });
  }

  getSnapshot(): SessionSnapshot {
    return this.snapshot;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void refreshPricing().catch(() => { /* fallback table used */ });
    this.bus.emit({ kind: "init", at: Date.now(), snapshot: this.snapshot });
    void this.consume().catch((err: unknown) => {
      log.error("runner crashed", { id: this.id, err: String(err) });
      this.apply({ type: "result.error", message: `runner crashed: ${String(err)}` });
    });
  }

  async kill(): Promise<void> {
    this.abort.abort();
    for (const [id, d] of this.pending) {
      d.resolve({ behavior: "deny", message: "session killed", interrupt: true, toolUseID: id });
    }
    this.pending.clear();
    this.apply({ type: "result.error", message: "killed by user" });
    this.bus.emit({ kind: "gone", at: Date.now(), id: this.id });
  }

  resolveApproval(toolUseId: string, allow: boolean): boolean {
    const d = this.pending.get(toolUseId);
    if (!d) return false;
    this.pending.delete(toolUseId);
    d.resolve(allow
      ? { behavior: "allow", updatedInput: this.snapshot.approval?.args ?? {}, toolUseID: toolUseId }
      : { behavior: "deny", message: "denied by user", toolUseID: toolUseId },
    );
    this.apply({ type: "approval.resolved", allow });
    return true;
  }

  private async consume(): Promise<void> {
    const cli = findClaudeCliPath();
    const bypass = this.config.dangerouslySkipPermissions === true;
    const auto = bypass || this.config.approvalMode === "auto";

    const opts: Options & {
      pathToClaudeCodeExecutable?: string;
      permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk";
      allowDangerouslySkipPermissions?: boolean;
    } = {
      cwd: this.config.cwd,
      model: MODEL_MAP[this.config.model] ?? this.config.model,
      allowedTools: auto ? [...this.config.allowedTools] : [],
      tools: [...this.config.allowedTools],
      abortController: this.abort,
      canUseTool: auto
        ? undefined
        : (toolName, input, callCtx) => this.gate(toolName, input, callCtx.toolUseID),
    };
    if (bypass) {
      opts.permissionMode = "bypassPermissions";
      opts.allowDangerouslySkipPermissions = true;
    } else if (this.config.approvalMode === "auto") {
      opts.permissionMode = "acceptEdits";
    }
    if (cli) opts.pathToClaudeCodeExecutable = cli;
    log.info("session start", { id: this.id, cwd: this.config.cwd, cli, model: opts.model, bypass, auto });
    const q = query({ prompt: this.config.prompt, options: opts });
    for await (const msg of q) this.handle(msg);
  }

  private gate(tool: string, args: Record<string, unknown>, toolUseId: string): Promise<PermissionResult> {
    const pending: PendingApproval = {
      toolUseId,
      tool,
      args,
      destructive: isDestructive(tool, args),
    };
    this.apply({ type: "pre_tool_use.approval", approval: pending });
    return new Promise<PermissionResult>((resolve, reject) => {
      this.pending.set(toolUseId, { resolve, reject });
    });
  }

  private handle(msg: SDKMessage): void {
    switch (msg.type) {
      case "system":
        if (msg.subtype === "init") this.apply({ type: "assistant.text", line: { t: "muted", v: `session ${msg.session_id} · init` } });
        return;

      case "assistant": {
        const apiMsg = msg.message as { id?: string; model?: string; usage?: Record<string, unknown> };
        if (typeof apiMsg.model === "string") this.rawModel = apiMsg.model;
        const key = typeof apiMsg.id === "string" ? apiMsg.id : null;
        if (apiMsg.usage && (!key || !this.seenMsgKeys.has(key))) {
          if (key) this.seenMsgKeys.add(key);
          const u = apiMsg.usage;
          this.usage.input        += numOr0(u.input_tokens);
          this.usage.output       += numOr0(u.output_tokens);
          this.usage.cacheRead    += numOr0(u.cache_read_input_tokens);
          const cc = u.cache_creation as Record<string, unknown> | undefined;
          if (cc) {
            this.usage.cacheCreate5m += numOr0(cc.ephemeral_5m_input_tokens);
            this.usage.cacheCreate1h += numOr0(cc.ephemeral_1h_input_tokens);
          } else {
            this.usage.cacheCreate5m += numOr0(u.cache_creation_input_tokens);
          }
          const cost = estimateCost(this.rawModel ?? this.snapshot.model, {
            input: this.usage.input,
            output: this.usage.output,
            cacheRead: this.usage.cacheRead,
            cacheCreate5m: this.usage.cacheCreate5m,
            cacheCreate1h: this.usage.cacheCreate1h,
          });
          this.apply({
            type: "usage.update",
            cost,
            inputTokens: this.usage.input,
            outputTokens: this.usage.output,
          });
        }
        for (const block of msg.message.content) {
          if (block.type === "text") {
            for (const ln of block.text.split("\n").filter(Boolean)) {
              this.apply({ type: "assistant.text", line: { t: "plain", v: ln } });
            }
          } else if (block.type === "tool_use") {
            const editInfo = extractEdit(block.name, block.input as Record<string, unknown>);
            this.apply({
              type: "assistant.tool_use",
              tool: block.name,
              editPath: editInfo.path,
              diff: editInfo.diff,
            });
          }
        }
        return;
      }

      case "user":
        return;

      case "result": {
        const inTok = msg.usage.input_tokens ?? 0;
        const outTok = msg.usage.output_tokens ?? 0;
        if (msg.subtype === "success") {
          this.apply({
            type: "result.success",
            summary: msg.result.slice(0, 240),
            artifacts: [],
            cost: msg.total_cost_usd,
            durationMs: msg.duration_ms,
            inputTokens: inTok,
            outputTokens: outTok,
          });
        } else {
          const errList = "errors" in msg ? msg.errors : [];
          this.apply({
            type: "result.error",
            message: errList[0] ?? msg.subtype,
            durationMs: msg.duration_ms,
            cost: msg.total_cost_usd,
            inputTokens: inTok,
            outputTokens: outTok,
          });
        }
        this.bus.emit({ kind: "gone", at: Date.now(), id: this.id });
        return;
      }

      default:
        return;
    }
  }

  apply(action: StateAction): void {
    const prev = this.snapshot;
    const next = reduce(prev, action);
    this.snapshot = next;

    if (action.type === "assistant.text") {
      this.logs.push(action.line);
      this.bus.emit({ kind: "log", at: Date.now(), id: this.id, line: action.line });
    }

    if (prev.state !== next.state) {
      const ev: SessionEvent = { kind: "transition", at: Date.now(), id: this.id, from: prev.state, to: next.state };
      this.bus.emit(ev);
    }

    this.bus.emit({ kind: "patch", at: Date.now(), id: this.id, patch: snapshotDiff(prev, next) });
  }
}

function numOr0(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function isDestructive(tool: string, args: Record<string, unknown>): boolean {
  if (tool === "Bash" && typeof args.command === "string") {
    const cmd = args.command;
    return /\b(rm\s+-rf?|mkfs|dd\s+if=|:\(\)\{|shutdown|reboot)\b/.test(cmd);
  }
  if (tool === "Write" || tool === "Edit") return false;
  return false;
}

function extractEdit(name: string, input: Record<string, unknown>): { path?: string; diff?: DiffRow[] } {
  if (name !== "Edit" && name !== "Write") return {};
  const path = typeof input.file_path === "string" ? input.file_path : undefined;
  if (name !== "Edit") return { path };
  const oldStr = typeof input.old_string === "string" ? input.old_string : "";
  const newStr = typeof input.new_string === "string" ? input.new_string : "";
  const rows: DiffRow[] = [];
  let ln = 1;
  for (const l of oldStr.split("\n")) rows.push({ type: "del", ln: String(ln++), txt: l });
  for (const l of newStr.split("\n")) rows.push({ type: "add", ln: String(ln++), txt: l });
  return { path, diff: rows.slice(0, 16) };
}

function snapshotDiff(a: SessionSnapshot, b: SessionSnapshot): Partial<SessionSnapshot> {
  const patch: Record<string, unknown> = {};
  (Object.keys(b) as (keyof SessionSnapshot)[]).forEach((k) => {
    if (a[k] !== b[k]) patch[k as string] = b[k];
  });
  return patch as Partial<SessionSnapshot>;
}
