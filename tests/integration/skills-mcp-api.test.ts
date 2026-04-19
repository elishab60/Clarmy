import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

const SKILL_BODY = `---
name: brainstorming
description: "Use before creative work. Rigid process."
---

Body content here.`;

describe("skills + mcp API integration", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({
      settings: {
        enabledPlugins: { "superpowers@official": true },
        mcpServers: { posthog: { command: "echo", args: ["hello"] } },
      },
      plugins: {
        "superpowers@official": {
          manifest: { name: "superpowers", version: "1.0.0" },
          skills: { brainstorming: SKILL_BODY },
        },
      },
    });
    process.env.COCKPIT_CLAUDE_HOME = fx.home;
  });
  afterEach(() => { delete process.env.COCKPIT_CLAUDE_HOME; });

  it("GET /api/skills returns real skills", async () => {
    const { GET } = await import("../../src/app/api/skills/route.ts");
    const res = await GET();
    const j = await res.json();
    const br = j.skills.find((s: { name: string }) => s.name === "brainstorming");
    expect(br).toBeDefined();
    expect(br.plugin).toBe("superpowers");
    expect(br.enabled).toBe(true);
  });

  it("POST /api/skills/toggle flips parent plugin", async () => {
    const { POST } = await import("../../src/app/api/skills/toggle/route.ts");
    const res = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ skillId: "superpowers:brainstorming" }),
    }));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.newEnabled).toBe(false);
  });

  it("GET /api/mcp lists enabled server", async () => {
    const { GET } = await import("../../src/app/api/mcp/route.ts");
    const res = await GET();
    const j = await res.json();
    const s = j.servers.find((x: { name: string }) => x.name === "posthog");
    expect(s).toBeDefined();
    expect(s.status).toBe("on");
  });

  it("POST /api/mcp/toggle moves server to disabled", async () => {
    const { POST } = await import("../../src/app/api/mcp/toggle/route.ts");
    const r = await POST(new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ serverId: "posthog" }),
    }));
    const j = await r.json();
    expect(j.ok).toBe(true);
    expect(j.enabled).toBe(false);
  });
});
