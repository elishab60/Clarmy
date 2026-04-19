import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

const SKILL_BODY = `---
name: brainstorming
description: "Use before creative work. Rigid process."
---

Body content here.`;

describe("scanSkills", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({
      settings: { enabledPlugins: { "superpowers@official": true } },
      plugins: {
        "superpowers@official": {
          manifest: { name: "superpowers", version: "1.0.0" },
          skills: { brainstorming: SKILL_BODY },
        },
      },
      userSkills: { "my-skill": `---\nname: my-skill\ndescription: personal\n---\nBody` },
    });
    process.env.COCKPIT_CLAUDE_HOME = fx.home;
  });
  afterEach(() => { delete process.env.COCKPIT_CLAUDE_HOME; });

  it("returns plugin skill + user skill", async () => {
    const { scanInstalledPlugins } = await import("../../src/lib/claude-code/plugins.ts");
    const { scanSkills } = await import("../../src/lib/claude-code/skills.ts");
    const skills = scanSkills(scanInstalledPlugins());
    const br = skills.find((s) => s.name === "brainstorming");
    expect(br).toBeDefined();
    expect(br!.plugin).toBe("superpowers");
    expect(br!.enabled).toBe(true);
    expect(br!.kind).toBe("rigid");
    const user = skills.find((s) => s.name === "my-skill");
    expect(user!.userLevel).toBe(true);
    expect(user!.enabled).toBe(true);
  });
});
