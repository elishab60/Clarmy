import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnConfig } from "../../src/lib/shared/types.ts";
import { modelBelongsToProvider } from "../../src/lib/shared/models.ts";
import { opencodeDriver } from "../../src/lib/providers/opencode/driver.ts";
import { parseModelLines } from "../../src/lib/providers/opencode/models.ts";
import { scanOpenCode } from "../../src/lib/providers/opencode/history.ts";
import { OpenCodeTailer } from "../../src/lib/providers/opencode/tailer.ts";
import type { TailPatch } from "../../src/lib/providers/types.ts";

function cfg(over: Partial<SpawnConfig>): SpawnConfig {
  return {
    provider: "opencode",
    project: "proj",
    cwd: "/tmp/proj",
    name: "n",
    model: "opencode/north-mini-code-free",
    prompt: "do the thing",
    allowedTools: [],
    approvalMode: "prompt",
    ...over,
  } as SpawnConfig;
}

describe("opencode buildArgs", () => {
  it("passes a catalogued model id straight through to -m and seeds --prompt", () => {
    const args = opencodeDriver.buildArgs(cfg({}), null);
    expect(args).toEqual(["-m", "opencode/north-mini-code-free", "--prompt", "do the thing"]);
  });

  it("passes a dynamic (uncatalogued) provider/model id through verbatim", () => {
    const args = opencodeDriver.buildArgs(cfg({ model: "zai-coding-plan/glm-5.2" }), null);
    expect(args.slice(0, 2)).toEqual(["-m", "zai-coding-plan/glm-5.2"]);
  });

  it("never emits --dangerously-skip-permissions (a run-only flag the TUI rejects)", () => {
    const args = opencodeDriver.buildArgs(cfg({ dangerouslySkipPermissions: true }), null);
    expect(args).not.toContain("--dangerously-skip-permissions");
  });

  it("resumes with -s and omits the prompt", () => {
    const args = opencodeDriver.buildArgs(cfg({ resumeSessionId: "ses_abc" }), null);
    expect(args).toEqual(["-m", "opencode/north-mini-code-free", "-s", "ses_abc"]);
    expect(args).not.toContain("--prompt");
  });
});

describe("opencode model discovery parsing", () => {
  it("keeps provider/model lines and drops noise", () => {
    const out = parseModelLines(
      "opencode/north-mini-code-free\nzai-coding-plan/glm-5.2\n\n   banner text   \nopencode/big-pickle\nzai-coding-plan/glm-5.2\n",
    );
    expect(out.map((m) => m.apiId)).toEqual([
      "opencode/north-mini-code-free",
      "zai-coding-plan/glm-5.2",
      "opencode/big-pickle",
    ]);
    expect(out[0]).toMatchObject({ provider: "opencode", label: "north-mini-code-free" });
  });
});

describe("modelBelongsToProvider", () => {
  it("accepts any provider/model id for opencode", () => {
    expect(modelBelongsToProvider("opencode", "zai-coding-plan/glm-5.2")).toBe(true);
    expect(modelBelongsToProvider("opencode", "opencode/big-pickle")).toBe(true);
  });
  it("rejects a non opencode-shaped id for opencode", () => {
    expect(modelBelongsToProvider("opencode", "sonnet-4.6")).toBe(false);
  });
  it("still enforces the static catalog for other providers", () => {
    expect(modelBelongsToProvider("claude", "sonnet-4.6")).toBe(true);
    expect(modelBelongsToProvider("codex", "sonnet-4.6")).toBe(false);
  });
});

describe("scanOpenCode (seeded SQLite)", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "oc-test-"));
    process.env.OPENCODE_DATA_DIR = dir;
    const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    const db = new DatabaseSync(join(dir, "opencode.db"));
    db.exec(`
      CREATE TABLE session (
        id text PRIMARY KEY, project_id text, directory text, title text,
        cost real DEFAULT 0, tokens_input integer DEFAULT 0, tokens_output integer DEFAULT 0,
        tokens_reasoning integer DEFAULT 0, tokens_cache_read integer DEFAULT 0,
        tokens_cache_write integer DEFAULT 0, model text,
        time_created integer, time_updated integer
      );
      CREATE TABLE message (id text PRIMARY KEY, session_id text, data text);
      CREATE TABLE part (id text PRIMARY KEY, session_id text, data text);
    `);
    db.prepare(
      "INSERT INTO session (id, project_id, directory, title, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, model, time_created, time_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "ses_test1", "prj_1", "/private/tmp/proj", "First prompt title",
      0.0123, 7553, 42, 8, 100, 5,
      JSON.stringify({ id: "north-mini-code-free", providerID: "opencode", variant: "default" }),
      1_781_000_000_000, 1_781_000_005_000,
    );
    db.prepare("INSERT INTO message (id, session_id, data) VALUES (?,?,?)").run("m1", "ses_test1", "{\"role\":\"user\"}");
    db.prepare("INSERT INTO message (id, session_id, data) VALUES (?,?,?)").run("m2", "ses_test1", "{\"role\":\"assistant\"}");
    db.prepare("INSERT INTO part (id, session_id, data) VALUES (?,?,?)").run("p1", "ses_test1", "{\"type\":\"text\"}");
    db.prepare("INSERT INTO part (id, session_id, data) VALUES (?,?,?)").run("p2", "ses_test1", "{\"type\":\"tool\",\"tool\":\"bash\"}");
    db.prepare("INSERT INTO part (id, session_id, data) VALUES (?,?,?)").run("p3", "ses_test1", "{\"type\":\"tool\",\"tool\":\"read\"}");
    // A GLM (zai-coding-plan) session: opencode records $0 (subscription) but the
    // tailer must estimate a real cost from the 1M input / 1M output tokens.
    db.prepare(
      "INSERT INTO session (id, project_id, directory, title, cost, tokens_input, tokens_output, tokens_reasoning, tokens_cache_read, tokens_cache_write, model, time_created, time_updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).run(
      "ses_glm", "prj_2", "/private/tmp/glmproj", "glm session",
      0, 1_000_000, 1_000_000, 0, 0, 0,
      JSON.stringify({ id: "glm-5.2", providerID: "zai-coding-plan", variant: "default" }),
      1_781_000_000_000, 1_781_000_006_000,
    );
    db.close();
  });

  afterAll(() => {
    delete process.env.OPENCODE_DATA_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("maps a session row to a ProviderSession with real tokens and counts", () => {
    const sessions = scanOpenCode();
    const s = sessions.find((x) => x.id === "ses_test1");
    expect(s).toBeDefined();
    expect(s!.provider).toBe("opencode");
    expect(s!.cwd).toBe("/private/tmp/proj");
    expect(s!.project).toBe("proj");
    expect(s!.firstPrompt).toBe("First prompt title");
    expect(s!.model).toBe("opencode/north-mini-code-free");
    expect(s!.startedAt).toBe(1_781_000_000_000);
    expect(s!.endedAt).toBe(1_781_000_005_000);
    expect(s!.messageCount).toBe(2);
    expect(s!.toolUses).toBe(2);
    expect(s!.usage).toHaveLength(1);
    expect(s!.usage[0]).toMatchObject({
      key: "ses_test1",
      inputTokens: 7553,
      outputTokens: 50, // tokens_output 42 + tokens_reasoning 8
      cacheReadTokens: 100,
      cacheCreate5mTokens: 5,
    });
  });

  describe("OpenCodeTailer (live patch)", () => {
  // The tailer matches a session by directory + time_created, so collect the
  // first patch emitted on start() (tick() runs synchronously once).
  function firstPatch(cwd: string, startedAt: number): TailPatch {
    const patches: TailPatch[] = [];
    const t = new OpenCodeTailer(cwd, startedAt, (p) => patches.push(p));
    t.start();
    t.stop();
    return Object.assign({}, ...patches);
  }

  it("estimates a non-zero cost for a GLM session opencode billed at $0", () => {
    const p = firstPatch("/private/tmp/glmproj", 1_781_000_000_000);
    // 1M input * $1.40/M + 1M output * $4.40/M = $5.80
    expect(p.cost).toBeCloseTo(5.8, 5);
    expect(p.inputTokens).toBe(1_000_000);
    expect(p.outputTokens).toBe(1_000_000);
  });

  it("emits resumeSessionId so the session can be resumed later", () => {
    const p = firstPatch("/private/tmp/glmproj", 1_781_000_000_000);
    expect(p.resumeSessionId).toBe("ses_glm");
  });

  it("falls back to the on-disk cost when no token estimate applies", () => {
    // ses_test1 runs a free opencode/* model (no catalogued price), so the
    // estimate is zero and the tailer keeps opencode's own recorded cost.
    const p = firstPatch("/private/tmp/proj", 1_781_000_000_000);
    expect(p.cost).toBeCloseTo(0.0123, 6);
    expect(p.resumeSessionId).toBe("ses_test1");
  });
  });
});
