import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";
import { computeRows } from "../../src/lib/providers/metrics-rows.ts";
import type { ProviderSession } from "../../src/lib/providers/types.ts";

const SID = "11111111-2222-3333-4444-555555555555";

function assistantLine(opts: {
  msgId: string; reqId: string; model?: string;
  input?: number; output?: number; ts?: string; sidechain?: boolean;
}): string {
  return JSON.stringify({
    type: "assistant",
    sessionId: SID,
    cwd: "/tmp/proj",
    requestId: opts.reqId,
    isSidechain: opts.sidechain ?? false,
    timestamp: opts.ts ?? "2026-06-11T10:00:00.000Z",
    message: {
      id: opts.msgId,
      model: opts.model ?? "claude-opus-4-8",
      usage: { input_tokens: opts.input ?? 100, output_tokens: opts.output ?? 10 },
      content: [{ type: "text", text: "hi" }],
    },
  });
}

function userLine(text: string): string {
  return JSON.stringify({
    type: "user", sessionId: SID, cwd: "/tmp/proj",
    timestamp: "2026-06-11T09:59:00.000Z",
    message: { content: text },
  });
}

describe("scanAll subagent folding", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({});
    const proj = join(fx.home, "projects", "-tmp-proj");
    // main transcript: 1 turn of 100 in / 10 out
    mkdirSync(proj, { recursive: true });
    writeFileSync(join(proj, `${SID}.jsonl`), [
      userLine("do the thing"),
      assistantLine({ msgId: "m1", reqId: "r1" }),
    ].join("\n") + "\n");
    // nested subagent: streaming writes the same msg:req repeatedly with
    // CUMULATIVE usage (first line output=5, last line the real total);
    // the last occurrence must win or output undercounts massively
    const sub = join(proj, SID, "subagents");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, "agent-abc.jsonl"), [
      assistantLine({ msgId: "s1", reqId: "q1", input: 1000, output: 5, sidechain: true }),
      assistantLine({ msgId: "s1", reqId: "q1", input: 1000, output: 50, sidechain: true }),
      assistantLine({ msgId: "s2", reqId: "q2", input: 2000, output: 70, sidechain: true, model: "claude-fable-5" }),
    ].join("\n") + "\n");
    process.env.COCKPIT_CLAUDE_HOME = fx.home;
  });
  afterEach(() => { delete process.env.COCKPIT_CLAUDE_HOME; });

  it("folds subagent transcripts into the parent session", async () => {
    const { scanAll } = await import("../../src/lib/claude-code/history.ts");
    const sessions = scanAll().filter((s) => s.id === SID);
    expect(sessions).toHaveLength(1); // folded, not three rows
    const s = sessions[0]!;
    // tokens include the children (dup line still raw-summed here; the metrics
    // layer dedups by msg:req key when pricing)
    // streamed duplicate counted ONCE, with the final (largest) usage
    expect(s.inputTokens).toBe(100 + 1000 + 2000);
    expect(s.outputTokens).toBe(10 + 50 + 70);
    expect(s.usage.length).toBe(3);
    expect(s.isSubagent).toBe(false); // base row is the main transcript
  });

  it("computeRows dedups replayed msg:req records when pricing", async () => {
    const { scanAll } = await import("../../src/lib/claude-code/history.ts");
    const s = scanAll().find((x) => x.id === SID)!;
    const provider: ProviderSession = {
      provider: "claude", id: s.id, cwd: s.cwd, project: s.project,
      startedAt: s.startedAt, endedAt: s.endedAt, model: s.model,
      messageCount: s.messageCount, toolUses: s.toolUses, state: s.state,
      usage: s.usage,
    };
    const row = computeRows([provider])[0]!;
    // duplicated subagent turn counted once: 100 + 1000 + 2000
    expect(row.input).toBe(3100);
    expect(row.output).toBe(10 + 50 + 70);
    expect(row.cost).toBeGreaterThan(0);
    const day = row.daily["2026-06-11"];
    expect(day).toBeDefined();
    expect(day!.o).toBe(130);
    // per-model attribution: the fable subagent record lands under mythos
    // (claude-fable-5's registry label), not under the session's opus label
    expect(row.models["mythos"]).toBeDefined();
    expect(row.models["mythos"]!.input).toBe(2000);
    expect(row.models["opus-4.8"]).toBeDefined();
    expect(row.models["opus-4.8"]!.input).toBe(1100);
    const fableCost = row.models["mythos"]!.cost;
    const opusCost = row.models["opus-4.8"]!.cost;
    expect(fableCost + opusCost).toBeCloseTo(row.cost, 10);
    // fable output is priced 2x opus: same tokens would cost double
    expect(fableCost).toBeGreaterThan(0);
  });
});
