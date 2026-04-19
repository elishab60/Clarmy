import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

describe("scanInstalledPlugins", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({
      settings: { enabledPlugins: { "superpowers@official": true, "vercel@official": false } },
      plugins: {
        "superpowers@official": { manifest: { name: "superpowers", version: "1.0.0", description: "big" } },
        "vercel@official": { manifest: { name: "vercel", version: "0.1.0", description: "deploy" } },
        "unused@official": { manifest: { name: "unused", version: "1.0.0" } },
      },
    });
    process.env.COCKPIT_CLAUDE_HOME = fx.home;
  });
  afterEach(() => { delete process.env.COCKPIT_CLAUDE_HOME; fx.cleanup(); });

  it("returns plugins with enabled status from settings", async () => {
    const { scanInstalledPlugins } = await import("../../src/lib/claude-code/plugins.ts");
    const plugins = scanInstalledPlugins();
    const sp = plugins.find((p) => p.id === "superpowers@official");
    expect(sp).toBeDefined();
    expect(sp!.enabled).toBe(true);
    expect(sp!.description).toBe("big");
    const vx = plugins.find((p) => p.id === "vercel@official");
    expect(vx!.enabled).toBe(false);
    const un = plugins.find((p) => p.id === "unused@official");
    expect(un!.enabled).toBe(false);
  });
});
