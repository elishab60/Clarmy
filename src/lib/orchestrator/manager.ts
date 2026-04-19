import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { createLogger } from "../util/logger.ts";
import { EventBus } from "./events.ts";
import { SessionRunner } from "./session.ts";
import { PtyRunner } from "./pty-runner.ts";
import { MockSessionRunner, loadFixtures } from "./mock.ts";
import { LiveWatcher } from "../claude-code/live-watcher.ts";
import type { SessionSnapshot, SpawnConfig, SessionEvent } from "../shared/types.ts";

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
  private readonly live: LiveWatcher | null;
  private mockLoaded = false;

  constructor(private readonly opts: { mock: boolean; fixturesDir: string }) {
    this.live = opts.mock ? null : new LiveWatcher(this.bus, (cwd) => this.isInternallyOwned(cwd));
    this.live?.start();
  }

  list(): SessionSnapshot[] {
    const own = Array.from(this.runners.values()).map((r) => r.getSnapshot());
    const external = this.live?.listSnapshots() ?? [];
    const seen = new Set(own.map((s) => s.id));
    const ownedCwds = this.activeOwnedCwds();
    const merged = own.slice();
    for (const s of external) {
      if (seen.has(s.id)) continue;
      if (s.cwd && ownedCwds.has(s.cwd)) continue;
      merged.push(s);
    }
    return merged;
  }

  get(id: string): SessionSnapshot | null {
    const own = this.runners.get(id)?.getSnapshot();
    if (own) return own;
    const ext = this.live?.listSnapshots().find((s) => s.id === id);
    if (!ext) return null;
    if (ext.cwd && this.activeOwnedCwds().has(ext.cwd)) return null;
    return ext;
  }

  isInternallyOwned(cwd: string | undefined): boolean {
    if (!cwd) return false;
    for (const r of this.runners.values()) {
      if (!(r instanceof PtyRunner)) continue;
      const snap = r.getSnapshot();
      if (snap.cwd === cwd && snap.state !== "done" && snap.state !== "error") return true;
    }
    return false;
  }

  private activeOwnedCwds(): Set<string> {
    const out = new Set<string>();
    for (const r of this.runners.values()) {
      if (!(r instanceof PtyRunner)) continue;
      const snap = r.getSnapshot();
      if (snap.cwd && snap.state !== "done" && snap.state !== "error") out.add(snap.cwd);
    }
    return out;
  }

  async spawn(config: SpawnConfig): Promise<string> {
    const id = `s_${randomBytes(3).toString("hex")}`;
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
    log.info("spawned", { id, project: config.project, mock: this.opts.mock });
    return id;
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
    if (!r) return false;
    await r.kill();
    this.runners.delete(id);
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
