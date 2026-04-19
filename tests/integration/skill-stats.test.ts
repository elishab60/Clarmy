import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

const SESSION_JSONL = [
  JSON.stringify({ type: "user", cwd: "/x", sessionId: "s1", timestamp: new Date().toISOString(), message: { content: "/superpowers:brainstorming let's design" } }),
  JSON.stringify({ type: "assistant", sessionId: "s1", timestamp: new Date().toISOString(), message: { model: "claude-opus-4-7", content: [{ type: "tool_use", name: "Skill", input: { skill: "test-driven-development" } }] } }),
].join("\n");

describe("scanSkillInvocations", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({
      sessions: { "proj/s1.jsonl": SESSION_JSONL },
    });
    process.env.COCKPIT_CLAUDE_HOME = fx.home;
  });
  afterEach(() => { delete process.env.COCKPIT_CLAUDE_HOME; });

  it("counts Skill tool_use and /plugin:skill prompts", async () => {
    const { scanSkillInvocations } = await import("../../src/lib/claude-code/skill-stats.ts");
    const invs = scanSkillInvocations();
    const names = invs.map((i) => i.skillName);
    expect(names).toContain("brainstorming");
    expect(names).toContain("test-driven-development");
  });
});
