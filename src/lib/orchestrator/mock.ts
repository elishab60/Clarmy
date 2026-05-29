import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { EventBus } from "./events.ts";
import { reduce, initialSnapshot, type StateAction } from "./state-machine.ts";
import type { SessionSnapshot, SpawnConfig, SessionEvent, LogLine, ModelId, ProviderId } from "../shared/types.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("mock");

interface MockEnvelope {
  readonly kind: StateAction["type"] | "delay";
  readonly ms?: number;
  readonly payload?: unknown;
}

export interface MockFixture {
  readonly id: string;
  readonly provider: ProviderId;
  readonly project: string;
  readonly name: string;
  readonly model: ModelId;
  readonly script: readonly MockEnvelope[];
}

export class MockSessionRunner {
  private snapshot: SessionSnapshot;
  private cancelled = false;

  constructor(
    public readonly id: string,
    private readonly bus: EventBus,
    private readonly fixture: MockFixture,
  ) {
    this.snapshot = initialSnapshot({
      type: "system.init",
      id,
      provider: fixture.provider,
      project: fixture.project,
      name: fixture.name,
      model: fixture.model,
      startedAt: Date.now(),
    });
  }

  getSnapshot(): SessionSnapshot { return this.snapshot; }

  start(): void {
    this.bus.emit({ kind: "init", at: Date.now(), snapshot: this.snapshot });
    void this.play();
  }

  async kill(): Promise<void> {
    this.cancelled = true;
    this.bus.emit({ kind: "gone", at: Date.now(), id: this.id });
  }

  resolveApproval(_toolUseId: string, allow: boolean): boolean {
    this.apply({ type: "approval.resolved", allow });
    return true;
  }

  private async play(): Promise<void> {
    for (const env of this.fixture.script) {
      if (this.cancelled) return;
      if (env.kind === "delay") {
        await sleep(env.ms ?? 200);
        continue;
      }
      const action = toAction(env);
      if (!action) continue;
      this.apply(action);
    }
  }

  private apply(action: StateAction): void {
    const prev = this.snapshot;
    const next = reduce(prev, action);
    this.snapshot = next;

    if (action.type === "assistant.text") {
      const line: LogLine = action.line;
      this.bus.emit({ kind: "log", at: Date.now(), id: this.id, line });
    }

    if (prev.state !== next.state) {
      const ev: SessionEvent = { kind: "transition", at: Date.now(), id: this.id, from: prev.state, to: next.state };
      this.bus.emit(ev);
    }

    this.bus.emit({ kind: "patch", at: Date.now(), id: this.id, patch: diff(prev, next) });
  }
}

function toAction(env: MockEnvelope): StateAction | null {
  switch (env.kind) {
    case "assistant.text":
    case "assistant.tool_use":
    case "pre_tool_use.approval":
    case "approval.resolved":
    case "post_tool_use":
    case "todo.update":
    case "result.success":
    case "result.error":
    case "cost.update":
    case "user.prompt":
    case "tool.reset":
    case "system.init":
      return { provider: "claude", ...(env.payload as object), type: env.kind } as StateAction;
    default:
      return null;
  }
}

function diff(a: SessionSnapshot, b: SessionSnapshot): Partial<SessionSnapshot> {
  const patch: Record<string, unknown> = {};
  (Object.keys(b) as (keyof SessionSnapshot)[]).forEach((k) => {
    if (a[k] !== b[k]) patch[k as string] = b[k];
  });
  return patch as Partial<SessionSnapshot>;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function loadFixtures(dir: string): MockFixture[] {
  const names = ["running", "tool", "approval", "error", "idle", "done"] as const;
  return names.map((n) => loadOne(dir, n));
}

function loadOne(dir: string, name: string): MockFixture {
  const path = resolve(dir, `${name}.jsonl`);
  if (!existsSync(path)) {
    log.warn("fixture missing, using default", { path });
    return defaultFixture(name);
  }
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim().length > 0);
  const envelopes = lines.map((l) => JSON.parse(l) as MockEnvelope);
  const meta = envelopes.find((e) => e.kind === "system.init");
  const init = meta?.payload as { id?: string; provider?: ProviderId; project?: string; name?: string; model?: ModelId } | undefined;
  return {
    id: init?.id ?? `mock_${name}`,
    provider: init?.provider ?? "claude",
    project: init?.project ?? "fixture",
    name: init?.name ?? name,
    model: init?.model ?? "sonnet-4.6",
    script: envelopes,
  };
}

function defaultFixture(name: string): MockFixture {
  return {
    id: `mock_${name}`,
    provider: "claude",
    project: "fixture",
    name,
    model: "sonnet-4.6",
    script: [],
  };
}
