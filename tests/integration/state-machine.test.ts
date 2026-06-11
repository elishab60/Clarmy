import { describe, it, expect } from "vitest";
import { reduce, initialSnapshot, type StateAction } from "../../src/lib/orchestrator/state-machine.ts";
import type { SessionSnapshot } from "../../src/lib/shared/types.ts";

function boot(): SessionSnapshot {
  return initialSnapshot({
    type: "system.init",
    id: "s_test",
    provider: "claude",
    project: "demo",
    name: "demo run",
    model: "mythos",
    startedAt: Date.now() - 5_000,
  });
}

function apply(s: SessionSnapshot, ...actions: StateAction[]): SessionSnapshot {
  return actions.reduce(reduce, s);
}

describe("state machine", () => {
  it("boots running with a clean snapshot", () => {
    const s = boot();
    expect(s.state).toBe("running");
    expect(s.cost).toBe(0);
    expect(s.toolsUsed).toBe(0);
    expect(s.tool).toBeNull();
  });

  it("tool_use increments the counter and post_tool_use returns to running", () => {
    let s = apply(boot(), { type: "assistant.tool_use", tool: "Bash" });
    expect(s.state).toBe("tool_use");
    expect(s.tool).toBe("Bash");
    expect(s.toolsUsed).toBe(1);
    s = apply(s, { type: "post_tool_use" });
    expect(s.state).toBe("running");
    expect(s.tool).toBeNull();
    expect(s.toolsUsed).toBe(1); // counter survives the reset
  });

  it("approval flow: allow resumes the tool, deny goes idle", () => {
    const pending = { toolUseId: "a1", tool: "Bash", args: { command: "rm -rf /tmp/x" }, destructive: true };
    let s = apply(boot(),
      { type: "assistant.tool_use", tool: "Bash" },
      { type: "pre_tool_use.approval", approval: pending });
    expect(s.state).toBe("approval");
    expect(s.approval).toEqual(pending);

    const allowed = apply(s, { type: "approval.resolved", allow: true });
    expect(allowed.state).toBe("tool_use");
    expect(allowed.approval).toBeUndefined();
    expect(allowed.tool).toBe("Bash");

    const denied = apply(s, { type: "approval.resolved", allow: false });
    expect(denied.state).toBe("idle");
    expect(denied.tool).toBeNull();
  });

  it("result.success lands in done with the authoritative cost", () => {
    const s = apply(boot(),
      { type: "usage.update", cost: 0.5, inputTokens: 100, outputTokens: 20 },
      { type: "result.success", summary: "all good", cost: 1.25 });
    expect(s.state).toBe("done");
    expect(s.cost).toBe(1.25); // final result overrides the running estimate
    expect(s.summary).toBe("all good");
    expect(s.endedAt).toBeGreaterThan(0);
    expect(s.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("result.error keeps the running cost when the result carries none", () => {
    const s = apply(boot(),
      { type: "usage.update", cost: 0.4, inputTokens: 10, outputTokens: 5 },
      { type: "result.error", message: "boom" });
    expect(s.state).toBe("error");
    expect(s.error).toBe("boom");
    expect(s.cost).toBe(0.4);
  });

  it("usage.update overwrites totals and preserves context fields when absent", () => {
    let s = apply(boot(), {
      type: "usage.update", cost: 1, inputTokens: 10, outputTokens: 2,
      contextTokens: 50_000, contextWindow: 1_000_000,
    });
    expect(s.contextTokens).toBe(50_000);
    s = apply(s, { type: "usage.update", cost: 2, inputTokens: 20, outputTokens: 4 });
    expect(s.cost).toBe(2);                  // overwrite, not additive
    expect(s.contextTokens).toBe(50_000);    // sticky when the action omits it
    expect(s.contextWindow).toBe(1_000_000);
  });

  it("todo.update tracks counts", () => {
    const s = apply(boot(), {
      type: "todo.update",
      items: [
        { status: "done", text: "a" },
        { status: "active", text: "b" },
        { status: "todo", text: "c" },
      ],
    });
    expect(s.todos).toBe(3);
    expect(s.todosDone).toBe(1);
  });

  it("logs are capped and appended in order", () => {
    let s = boot();
    for (let i = 0; i < 600; i += 1) {
      s = apply(s, { type: "assistant.text", line: { t: "plain", v: `line ${i}` } });
    }
    expect(s.logs.length).toBeLessThanOrEqual(500);
    expect(s.logs[s.logs.length - 1]!.v).toBe("line 599");
  });
});
