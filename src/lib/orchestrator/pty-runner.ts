import { spawn as ptySpawn, type IPty } from "node-pty";
import { createLogger } from "../util/logger.ts";
import { findClaudeCliPath } from "../claude-code/history.ts";
import { initialSnapshot } from "./state-machine.ts";
import type { EventBus } from "./events.ts";
import type { SessionSnapshot, SpawnConfig } from "../shared/types.ts";

const log = createLogger("pty");

const HIST_BYTES = 256 * 1024;
const MODEL_FLAGS: Record<string, string> = {
  "opus-4.7": "claude-opus-4-7",
  "sonnet-4.6": "claude-sonnet-4-6",
  "haiku-4.5": "claude-haiku-4-5",
};

type DataListener = (data: Buffer) => void;
type ExitListener = (exitCode: number) => void;

export class PtyRunner {
  private readonly pty: IPty;
  private readonly history: Buffer[] = [];
  private historySize = 0;
  private readonly dataListeners = new Set<DataListener>();
  private readonly exitListeners = new Set<ExitListener>();
  private snapshot: SessionSnapshot;
  private exitCode: number | null = null;
  private cols = 120;
  private rows = 36;

  constructor(
    public readonly id: string,
    private readonly bus: EventBus,
    private readonly config: SpawnConfig,
  ) {
    const cli = findClaudeCliPath();
    if (!cli) throw new Error("Claude Code CLI not found — install it and ensure ~/.local/bin/claude exists");

    const args = buildArgs(config);
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

    log.info("pty spawn", { id, cli, cwd: config.cwd, args });
    this.pty = ptySpawn(cli, args, {
      name: "xterm-256color",
      cols: this.cols,
      rows: this.rows,
      cwd: config.cwd,
      env: {
        ...process.env,
        TERM: "xterm-256color",
        FORCE_COLOR: "3",
        COLORTERM: "truecolor",
      },
    });

    this.pty.onData((data) => {
      const buf = Buffer.from(data, "utf8");
      this.pushHistory(buf);
      for (const l of this.dataListeners) {
        try { l(buf); } catch { /* ignore */ }
      }
    });

    this.pty.onExit(({ exitCode }) => {
      this.exitCode = exitCode;
      log.info("pty exit", { id, exitCode });
      this.snapshot = { ...this.snapshot, state: exitCode === 0 ? "done" : "error", endedAt: Date.now(), durationMs: Date.now() - this.snapshot.startedAt, error: exitCode !== 0 ? `exited with code ${exitCode}` : undefined };
      const prevState = "running";
      this.bus.emit({ kind: "transition", at: Date.now(), id: this.id, from: prevState, to: this.snapshot.state });
      this.bus.emit({ kind: "patch", at: Date.now(), id: this.id, patch: { state: this.snapshot.state, endedAt: this.snapshot.endedAt, durationMs: this.snapshot.durationMs, error: this.snapshot.error } });
      this.bus.emit({ kind: "gone", at: Date.now(), id: this.id });
      for (const l of this.exitListeners) {
        try { l(exitCode); } catch { /* ignore */ }
      }
    });

    // send initial prompt after a brief delay so the CLI banner settles.
    // Skip when resuming — the CLI opens the session ready for user input.
    if (config.prompt && !config.resumeSessionId) {
      setTimeout(() => {
        if (this.exitCode !== null) return;
        this.pty.write(config.prompt);
        setTimeout(() => { if (this.exitCode === null) this.pty.write("\r"); }, 120);
      }, 700);
    }
  }

  getSnapshot(): SessionSnapshot { return this.snapshot; }

  start(): void {
    this.bus.emit({ kind: "init", at: Date.now(), snapshot: this.snapshot });
  }

  write(data: string | Buffer): void {
    if (this.exitCode !== null) return;
    if (typeof data === "string") this.pty.write(data);
    else this.pty.write(data.toString("utf8"));
  }

  resize(cols: number, rows: number): void {
    if (this.exitCode !== null) return;
    const c = Math.max(20, Math.min(500, Math.floor(cols)));
    const r = Math.max(5,  Math.min(200, Math.floor(rows)));
    if (c === this.cols && r === this.rows) return;
    this.cols = c; this.rows = r;
    try { this.pty.resize(c, r); } catch (err) { log.error("resize failed", { err: String(err) }); }
  }

  async kill(): Promise<void> {
    if (this.exitCode !== null) return;
    try { this.pty.kill(); } catch { /* ignore */ }
  }

  resolveApproval(_toolUseId: string, _allow: boolean): boolean {
    return false;
  }

  onData(cb: DataListener): () => void {
    this.dataListeners.add(cb);
    return () => { this.dataListeners.delete(cb); };
  }

  onExit(cb: ExitListener): () => void {
    if (this.exitCode !== null) { cb(this.exitCode); return () => { /* noop */ }; }
    this.exitListeners.add(cb);
    return () => { this.exitListeners.delete(cb); };
  }

  getHistory(): Buffer {
    return Buffer.concat(this.history);
  }

  getExitCode(): number | null { return this.exitCode; }

  private pushHistory(buf: Buffer): void {
    this.history.push(buf);
    this.historySize += buf.length;
    while (this.historySize > HIST_BYTES && this.history.length > 1) {
      const dropped = this.history.shift();
      if (dropped) this.historySize -= dropped.length;
    }
  }
}

function buildArgs(cfg: SpawnConfig): string[] {
  const args: string[] = [];
  if (cfg.resumeSessionId) args.push("--resume", cfg.resumeSessionId);
  const model = MODEL_FLAGS[cfg.model];
  if (model) args.push("--model", model);
  if (cfg.dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
  else if (cfg.approvalMode === "auto") args.push("--permission-mode", "acceptEdits");
  else if (cfg.approvalMode === "strict") args.push("--permission-mode", "default");
  return args;
}
