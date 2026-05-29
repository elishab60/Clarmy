import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync, statSync } from "node:fs";
import { createLogger } from "../util/logger.ts";
import { EventBus } from "./events.ts";
import { SessionRunner } from "./session.ts";
import { PtyRunner } from "./pty-runner.ts";
import { MockSessionRunner, loadFixtures } from "./mock.ts";
import { listPersisted, upsertPersisted, patchPersisted, removePersisted } from "./session-store.ts";
import type { Effort, SessionSnapshot, SpawnConfig, SessionEvent } from "../shared/types.ts";

const log = createLogger("manager");

interface Runner {
  readonly id: string;
  getSnapshot(): SessionSnapshot;
  start(): void;
  kill(): Promise<void>;
  resolveApproval(toolUseId: string, allow: boolean): boolean;
}

export interface PtyCapable {
  write(data: string | Buffer): void;
  resize(cols: number, rows: number): void;
  onData(cb: (buf: Buffer) => void): () => void;
  onExit(cb: (code: number) => void): () => void;
  getHistory(): Buffer;
  getExitCode(): number | null;
}

export class SessionManager {
  private readonly runners = new Map<string, Runner>();
  private readonly bus = new EventBus();
  private mockLoaded = false;
  private restored = false;
  private readonly persistedIds = new Set<string>();

  constructor(private readonly opts: { mock: boolean; fixturesDir: string }) {
    if (!opts.mock) this.bus.subscribe((e) => this.persistFromEvent(e));
  }

  // Mirror live-session lifecycle into the on-disk store so sessions can be
  // resumed after a server/container restart. The entry is created in spawn();
  // here we capture the CLI session id and drop the entry when the pty exits.
  private persistFromEvent(e: SessionEvent): void {
    if (e.kind === "gone") {
      if (this.persistedIds.delete(e.id)) removePersisted(e.id);
      return;
    }
    if (e.kind === "patch" && this.persistedIds.has(e.id)) {
      const sid = e.patch.resumeSessionId;
      if (typeof sid === "string" && sid) patchPersisted(e.id, { claudeSessionId: sid });
    }
  }

  list(): SessionSnapshot[] {
    return Array.from(this.runners.values()).map((r) => r.getSnapshot());
  }

  get(id: string): SessionSnapshot | null {
    return this.runners.get(id)?.getSnapshot() ?? null;
  }

  async spawn(config: SpawnConfig): Promise<string> {
    const id = `s_${randomBytes(3).toString("hex")}`;
    if (!this.opts.mock) {
      this.persistedIds.add(id);
      upsertPersisted({
        id,
        project: config.project,
        cwd: config.cwd,
        name: config.name,
        model: config.model,
        allowedTools: config.allowedTools,
        approvalMode: config.approvalMode,
        branch: config.branch,
        dangerouslySkipPermissions: config.dangerouslySkipPermissions,
        effort: config.effort,
        claudeSessionId: config.resumeSessionId,
        startedAt: Date.now(),
      });
    }
    try {
      this.instantiate(id, config);
    } catch (err) {
      this.persistedIds.delete(id);
      removePersisted(id);
      throw err;
    }
    log.info("spawned", { id, project: config.project, mock: this.opts.mock });
    return id;
  }

  private instantiate(id: string, config: SpawnConfig): Runner {
    const runner: Runner = this.opts.mock
      ? new MockSessionRunner(id, this.bus, {
          id, project: config.project, name: config.name, model: config.model,
          script: [
            { kind: "assistant.text", payload: { line: { t: "gt", v: `› ${config.prompt.slice(0, 80)}` } } },
            { kind: "delay", ms: 600 },
            { kind: "assistant.text", payload: { line: { t: "muted", v: " › reading repo…" } } },
            { kind: "delay", ms: 400 },
            { kind: "result.success", payload: { summary: "Mocked success.", artifacts: [], cost: 0.01 } },
          ],
        })
      : new PtyRunner(id, this.bus, config);
    this.runners.set(id, runner);
    runner.start();
    return runner;
  }

  // Re-open sessions that were live before a server/container restart. Each is
  // resumed idle (no prompt) via the CLI's --resume; the in-flight turn at the
  // time of the kill is lost but the conversation continues. Runs once.
  restore(): void {
    if (this.restored || this.opts.mock) return;
    this.restored = true;
    const persisted = listPersisted();
    let resumed = 0;
    for (const s of persisted) {
      if (!s.claudeSessionId) { removePersisted(s.id); continue; }
      let cwdOk = false;
      try { cwdOk = existsSync(s.cwd) && statSync(s.cwd).isDirectory(); } catch { cwdOk = false; }
      if (!cwdOk) { this.persistedIds.delete(s.id); removePersisted(s.id); continue; }
      this.persistedIds.add(s.id);
      try {
        this.instantiate(s.id, {
          project: s.project,
          cwd: s.cwd,
          name: s.name,
          model: s.model,
          prompt: "",
          allowedTools: s.allowedTools,
          approvalMode: s.approvalMode,
          branch: s.branch,
          dangerouslySkipPermissions: s.dangerouslySkipPermissions,
          resumeSessionId: s.claudeSessionId,
          effort: s.effort,
        });
        resumed++;
      } catch (err) {
        this.persistedIds.delete(s.id);
        removePersisted(s.id);
        log.warn("restore failed", { id: s.id, err: String(err) });
      }
    }
    if (persisted.length) log.info("sessions restored", { resumed, total: persisted.length });
  }

  getPty(id: string): PtyCapable | null {
    const r = this.runners.get(id);
    if (!r) return null;
    if (r instanceof PtyRunner) return r;
    return null;
  }

  // retained for backward compat: SDK-based runner available as alternate path
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _legacyRunner = SessionRunner;

  async kill(id: string): Promise<boolean> {
    const r = this.runners.get(id);
    if (r) {
      await r.kill();
      this.runners.delete(id);
      this.bus.emit({ kind: "gone", at: Date.now(), id });
      return true;
    }
    this.bus.emit({ kind: "gone", at: Date.now(), id });
    return true;
  }

  async fork(id: string, prompt: string): Promise<string | null> {
    const src = this.runners.get(id);
    if (!src) return null;
    const snap = src.getSnapshot();
    return this.spawn({
      project: snap.project,
      cwd: process.cwd(),
      name: `fork · ${snap.name}`,
      model: snap.model,
      prompt,
      allowedTools: ["Read", "Grep", "Glob"],
      approvalMode: "prompt",
    });
  }

  setEffort(id: string, effort: Effort): boolean {
    const r = this.runners.get(id);
    if (!(r instanceof PtyRunner)) return false;
    r.setEffort(effort);
    return true;
  }

  approve(id: string, toolUseId: string, allow: boolean): boolean {
    const r = this.runners.get(id);
    if (!r) return false;
    return r.resolveApproval(toolUseId, allow);
  }

  subscribe(cb: (e: SessionEvent) => void): () => void {
    return this.bus.subscribe(cb);
  }

  loadMockFixtures(): void {
    if (!this.opts.mock || this.mockLoaded) return;
    this.mockLoaded = true;
    const fixtures = loadFixtures(this.opts.fixturesDir);
    for (const f of fixtures) {
      const runner = new MockSessionRunner(f.id, this.bus, f);
      this.runners.set(f.id, runner);
      runner.start();
    }
    log.info("mock fixtures loaded", { count: fixtures.length });
  }
}

const SINGLETON_KEY = Symbol.for("cockpit.session-manager");

type Holder = { [k: symbol]: SessionManager | undefined };

export function getManager(): SessionManager {
  const g = globalThis as unknown as Holder;
  const existing = g[SINGLETON_KEY];
  if (existing) return existing;
  const mock = process.env.COCKPIT_MOCK === "1";
  const manager = new SessionManager({
    mock,
    fixturesDir: resolve(process.cwd(), "mocks/sessions"),
  });
  if (mock) manager.loadMockFixtures();
  g[SINGLETON_KEY] = manager;
  return manager;
}
