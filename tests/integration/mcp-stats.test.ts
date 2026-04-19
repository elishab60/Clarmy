import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

const SESS = [
  JSON.stringify({
    type: "assistant",
    sessionId: "s1",
    timestamp: "2026-04-19T10:00:00Z",
    message: {
      content: [{ type: "tool_use", id: "tu1", name: "mcp__posthog__query", input: {} }],
    },
  }),
  JSON.stringify({
    type: "user",
    sessionId: "s1",
    timestamp: "2026-04-19T10:00:01Z",
    message: {
      content: [{ type: "tool_result", tool_use_id: "tu1", is_error: false }],
    },
  }),
  JSON.stringify({
    type: "assistant",
    sessionId: "s1",
    timestamp: "2026-04-19T10:01:00Z",
    message: {
      content: [{ type: "tool_use", id: "tu2", name: "mcp__posthog__query", input: {} }],
    },
  }),
  JSON.stringify({
    type: "user",
    sessionId: "s1",
    timestamp: "2026-04-19T10:01:01Z",
    message: {
      content: [{ type: "tool_result", tool_use_id: "tu2", is_error: true }],
    },
  }),
].join("\n");

describe("scanMcpCalls + aggregateByServer", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({ sessions: { "p/s1.jsonl": SESS } });
    process.env.COCKPIT_CLAUDE_HOME = fx.home;
  });
  afterEach(() => {
    delete process.env.COCKPIT_CLAUDE_HOME;
  });

  it("counts calls and errors per server", async () => {
    const { scanMcpCalls, aggregateByServer } = await import(
      "../../src/lib/claude-code/mcp-stats.ts"
    );
    const agg = aggregateByServer(scanMcpCalls());
    const s = agg.get("posthog")!;
    expect(s.count).toBe(2);
    expect(s.ok).toBe(1);
    expect(s.err).toBe(1);
    expect(s.tools.get("query")!.count).toBe(2);
  });
});
