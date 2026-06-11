import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

describe("mcp-config", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({
      claudeJson: {
        mcpServers: { posthog: { command: "npx", args: ["-y", "@posthog/mcp-server"] } },
      },
      settings: {
        cockpit: { disabledMcpServers: { legacy: { command: "noop" } } },
      },
    });
    process.env.COCKPIT_CLAUDE_HOME = fx.home;
  });
  afterEach(() => { delete process.env.COCKPIT_CLAUDE_HOME; });

  it("reads enabled and disabled servers", async () => {
    const { readMcpServers } = await import("../../src/lib/claude-code/mcp-config.ts");
    const r = readMcpServers();
    expect(Object.keys(r.enabled)).toContain("posthog");
    expect(Object.keys(r.disabled)).toContain("legacy");
  });

  it("toggles a server from enabled to disabled and back", async () => {
    const { toggleMcpServer, settingsFilePath } = await import("../../src/lib/claude-code/mcp-config.ts");
    const { claudeJsonPath } = await import("../../src/lib/claude-code/paths.ts");
    toggleMcpServer("posthog");
    const cj1 = JSON.parse(readFileSync(claudeJsonPath(), "utf8"));
    const st1 = JSON.parse(readFileSync(settingsFilePath(), "utf8"));
    expect(cj1.mcpServers.posthog).toBeUndefined();
    expect(st1.cockpit.disabledMcpServers.posthog).toBeDefined();
    toggleMcpServer("posthog");
    const cj2 = JSON.parse(readFileSync(claudeJsonPath(), "utf8"));
    const st2 = JSON.parse(readFileSync(settingsFilePath(), "utf8"));
    expect(cj2.mcpServers.posthog).toBeDefined();
    expect(st2.cockpit.disabledMcpServers.posthog).toBeUndefined();
  });

  it("adds and removes a server", async () => {
    const { addMcpServer, removeMcpServer, readMcpServers } = await import("../../src/lib/claude-code/mcp-config.ts");
    addMcpServer("new-one", { command: "echo", args: ["hi"] });
    expect(readMcpServers().enabled["new-one"]).toBeDefined();
    removeMcpServer("new-one");
    expect(readMcpServers().enabled["new-one"]).toBeUndefined();
  });
});
