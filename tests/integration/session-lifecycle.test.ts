import { describe, it, expect } from "vitest";
import { reduce, initialSnapshot, type StateAction } from "../../src/lib/orchestrator/state-machine.ts";
import type { SessionSnapshot } from "../../src/lib/shared/types.ts";

function walk(start: SessionSnapshot, actions: StateAction[]): SessionSnapshot[] {
  const out: SessionSnapshot[] = [start];
  let cur = start;
  for (const a of actions) {
    cur = reduce(cur, a);
    out.push(cur);
  }
  return out;
}

describe("session state machine", () => {
  const base = initialSnapshot({
    type: "system.init",
    id: "s_test",
    provider: "claude",
    project: "test",
    name: "spec walk",
    model: "sonnet-4.6",
    startedAt: 0,
  });

  it("starts in running", () => {
    expect(base.state).toBe("running");
  });

  it("transitions running → tool_use", () => {
    const [, next] = walk(base, [{ type: "assistant.tool_use", tool: "Bash" }]);
    expect(next!.state).toBe("tool_use");
    expect(next!.tool).toBe("Bash");
  });

  it("transitions tool_use → approval via gate", () => {
    const res = walk(base, [
      { type: "assistant.tool_use", tool: "Bash" },
      {
        type: "pre_tool_use.approval",
        approval: { toolUseId: "tu_1", tool: "Bash", args: { command: "rm -rf node_modules" }, destructive: true },
      },
    ]);
    const last = res[res.length - 1]!;
    expect(last.state).toBe("approval");
    expect(last.approval?.tool).toBe("Bash");
  });

  it("transitions approval → idle on deny", () => {
    const res = walk(base, [
      { type: "pre_tool_use.approval", approval: { toolUseId: "tu_2", tool: "Write", args: {}, destructive: false } },
      { type: "approval.resolved", allow: false },
    ]);
    const last = res[res.length - 1]!;
    expect(last.state).toBe("idle");
    expect(last.approval).toBeUndefined();
  });

  it("transitions to error via result.error", () => {
    const [, next] = walk(base, [{ type: "result.error", message: "boom", retryIn: 3 }]);
    expect(next!.state).toBe("error");
    expect(next!.error).toBe("boom");
  });

  it("transitions to done via result.success", () => {
    const [, next] = walk(base, [{ type: "result.success", summary: "ok", artifacts: ["PR #1"], cost: 0.42 }]);
    expect(next!.state).toBe("done");
    expect(next!.cost).toBe(0.42);
  });

  it("walks through all six states in one run", () => {
    const steps: StateAction[] = [
      { type: "assistant.text", line: { t: "gt", v: "start" } },
      { type: "assistant.tool_use", tool: "Read" },
      { type: "pre_tool_use.approval", approval: { toolUseId: "tu_3", tool: "Bash", args: {}, destructive: false } },
      { type: "approval.resolved", allow: false },
      { type: "result.error", message: "needs user input" },
      { type: "user.prompt", line: { t: "gt", v: "retry" } },
      { type: "result.success", summary: "done", artifacts: [], cost: 0.1 },
    ];
    const trail = walk(base, steps).map((s) => s.state);
    expect(trail).toEqual([
      "running",
      "running",
      "tool_use",
      "approval",
      "idle",
      "error",
      "running",
      "done",
    ]);
  });
});
