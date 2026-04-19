import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

describe("mcp-config", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({
      settings: {
        mcpServers: { posthog: { command: "npx", args: ["-y", "@posthog/mcp-server"] } },
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
    toggleMcpServer("posthog");
    const raw1 = JSON.parse(readFileSync(settingsFilePath(), "utf8"));
    expect(raw1.mcpServers.posthog).toBeUndefined();
    expect(raw1.cockpit.disabledMcpServers.posthog).toBeDefined();
    toggleMcpServer("posthog");
    const raw2 = JSON.parse(readFileSync(settingsFilePath(), "utf8"));
    expect(raw2.mcpServers.posthog).toBeDefined();
    expect(raw2.cockpit.disabledMcpServers.posthog).toBeUndefined();
  });

  it("adds and removes a server", async () => {
    const { addMcpServer, removeMcpServer, readMcpServers } = await import("../../src/lib/claude-code/mcp-config.ts");
    addMcpServer("new-one", { command: "echo", args: ["hi"] });
    expect(readMcpServers().enabled["new-one"]).toBeDefined();
    removeMcpServer("new-one");
    expect(readMcpServers().enabled["new-one"]).toBeUndefined();
  });
});
