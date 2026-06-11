import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

describe("retention", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = makeClaudeHome({ settings: { theme: "dark", cleanupPeriodDays: 30 } });
    process.env.COCKPIT_CLAUDE_HOME = fx.home;
  });
  afterEach(() => { delete process.env.COCKPIT_CLAUDE_HOME; });

  it("reports the configured finite retention as non-persistent", async () => {
    const { readRetention } = await import("../../src/lib/claude-code/retention.ts");
    const r = readRetention();
    expect(r.cleanupPeriodDays).toBe(30);
    expect(r.persistent).toBe(false);
  });

  it("defaults to 30 days when the key is absent", async () => {
    const fx2 = makeClaudeHome({ settings: { theme: "dark" } });
    process.env.COCKPIT_CLAUDE_HOME = fx2.home;
    const { readRetention } = await import("../../src/lib/claude-code/retention.ts");
    const r = readRetention();
    expect(r.cleanupPeriodDays).toBe(30);
    expect(r.persistent).toBe(false);
  });

  it("makeHistoryPersistent pins the value and preserves other keys", async () => {
    const { makeHistoryPersistent, readRetention, PERSISTENT_DAYS } = await import("../../src/lib/claude-code/retention.ts");
    const r = makeHistoryPersistent();
    expect(r.persistent).toBe(true);
    expect(r.cleanupPeriodDays).toBe(PERSISTENT_DAYS);
    const raw = JSON.parse(readFileSync(join(fx.home, "settings.json"), "utf8"));
    expect(raw.cleanupPeriodDays).toBe(PERSISTENT_DAYS);
    expect(raw.theme).toBe("dark"); // untouched
    expect(readRetention().persistent).toBe(true);
  });

  it("treats an already-long retention as persistent", async () => {
    const fx3 = makeClaudeHome({ settings: { cleanupPeriodDays: 36500 } });
    process.env.COCKPIT_CLAUDE_HOME = fx3.home;
    const { readRetention } = await import("../../src/lib/claude-code/retention.ts");
    expect(readRetention().persistent).toBe(true);
  });
});
