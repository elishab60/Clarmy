# Skills & MCP real data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/skills` and `/mcp` pages 100% functional against the real `~/.claude/` filesystem with real invocation metrics, plus CRUD on MCP servers.

**Architecture:** Server-only Node modules under `src/lib/claude-code/` read `~/.claude/settings.json`, plugin caches, `SKILL.md` files, and session JSONL. API routes under `src/app/api/{skills,mcp}/` expose read + mutate endpoints. Client pages fetch and poll. Test isolation via `COCKPIT_CLAUDE_HOME` env var.

**Tech Stack:** Next.js 15 App Router, TypeScript strict, zod validation, vitest, Node `child_process` for MCP probe.

---

## File Structure

**New library modules (`src/lib/claude-code/`):**
- `paths.ts` — `claudeHome()` + path helpers (test isolation)
- `plugins.ts` — scan installed plugins
- `skills.ts` — scan skills from plugins + user dir, YAML front-matter parser
- `skill-stats.ts` — count invocations from JSONL
- `mcp-config.ts` — read/write `settings.json.mcpServers` + `cockpit.disabledMcpServers`
- `mcp-probe.ts` — spawn + MCP `initialize` handshake
- `mcp-stats.ts` — count `mcp__server__tool` invocations
- `mcp-logs.ts` — tail `~/.claude/debug/`

**API routes (all `runtime = "nodejs"`, zod validated):**
- `src/app/api/skills/route.ts` — GET list
- `src/app/api/skills/[id]/body/route.ts` — GET SKILL.md body
- `src/app/api/skills/[id]/invocations/route.ts` — GET recent invocations
- `src/app/api/skills/toggle/route.ts` — POST toggle parent plugin
- `src/app/api/mcp/route.ts` — GET list, POST add
- `src/app/api/mcp/[id]/route.ts` — GET detail, DELETE
- `src/app/api/mcp/[id]/tools/route.ts` — GET tools + counts
- `src/app/api/mcp/[id]/logs/route.ts` — GET tail logs
- `src/app/api/mcp/toggle/route.ts` — POST toggle on/off
- `src/app/api/mcp/test/route.ts` — POST probe
- `src/app/api/mcp/import/route.ts` — POST merge config

**Client components:**
- `src/components/views/skills-page.tsx` — rewritten, ≤ 200 lines
- `src/components/views/skills/skill-detail.tsx` — right pane
- `src/components/views/skills/skill-toggle-confirm.tsx` — modal
- `src/components/views/mcp-page.tsx` — rewritten, ≤ 200 lines
- `src/components/views/mcp/mcp-detail.tsx`
- `src/components/views/mcp/mcp-add-modal.tsx`
- `src/components/views/mcp/mcp-import-modal.tsx`
- `src/components/views/mcp/mcp-logs-drawer.tsx`

**Tests:**
- `tests/integration/skills-mcp.test.ts` — end-to-end with tmpdir

---

## Task 1: Path helpers + test fixture setup

**Files:**
- Create: `src/lib/claude-code/paths.ts`
- Create: `tests/integration/_fixtures.ts`

- [ ] **Step 1.1: Create `paths.ts`**

```ts
import { homedir } from "node:os";
import { resolve, join } from "node:path";

export function claudeHome(): string {
  return process.env.COCKPIT_CLAUDE_HOME ?? resolve(homedir(), ".claude");
}

export function settingsPath(): string { return join(claudeHome(), "settings.json"); }
export function pluginsCacheDir(): string { return join(claudeHome(), "plugins", "cache"); }
export function installedPluginsPath(): string { return join(claudeHome(), "plugins", "installed_plugins.json"); }
export function userSkillsDir(): string { return join(claudeHome(), "skills"); }
export function projectsDir(): string { return join(claudeHome(), "projects"); }
export function debugDir(): string { return join(claudeHome(), "debug"); }
```

- [ ] **Step 1.2: Create `_fixtures.ts`** — helper to build a fake `~/.claude/` in a tmpdir

```ts
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Fixture {
  readonly home: string;
  cleanup(): void;
}

export function makeClaudeHome(opts: {
  settings?: Record<string, unknown>;
  plugins?: Record<string, { manifest: Record<string, unknown>; skills?: Record<string, string> }>;
  userSkills?: Record<string, string>;
  sessions?: Record<string, string>;
}): Fixture {
  const home = mkdtempSync(join(tmpdir(), "cockpit-test-"));
  mkdirSync(join(home, "plugins", "cache"), { recursive: true });
  if (opts.settings) writeFileSync(join(home, "settings.json"), JSON.stringify(opts.settings, null, 2));
  writeFileSync(join(home, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: {} }, null, 2));
  for (const [fullId, p] of Object.entries(opts.plugins ?? {})) {
    const [name, marketplace] = fullId.split("@");
    const dir = join(home, "plugins", "cache", marketplace!, name!, "1.0.0");
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify(p.manifest, null, 2));
    for (const [skillName, body] of Object.entries(p.skills ?? {})) {
      const sdir = join(dir, "skills", skillName);
      mkdirSync(sdir, { recursive: true });
      writeFileSync(join(sdir, "SKILL.md"), body);
    }
  }
  for (const [skillName, body] of Object.entries(opts.userSkills ?? {})) {
    const sdir = join(home, "skills", skillName);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, "SKILL.md"), body);
  }
  for (const [sessPath, body] of Object.entries(opts.sessions ?? {})) {
    const full = join(home, "projects", sessPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return {
    home,
    cleanup() { /* tmpdir — best-effort, OS cleans */ },
  };
}
```

- [ ] **Step 1.3: Commit**

```bash
git add src/lib/claude-code/paths.ts tests/integration/_fixtures.ts
git commit -m "feat(claude-code): add path helpers and test fixture builder"
```

---

## Task 2: Plugins scanner

**Files:**
- Create: `src/lib/claude-code/plugins.ts`
- Create: `tests/integration/plugins.test.ts`

- [ ] **Step 2.1: Write failing test**

```ts
// tests/integration/plugins.test.ts
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
```

- [ ] **Step 2.2: Run — expect FAIL**

```bash
pnpm test -- plugins.test
```

- [ ] **Step 2.3: Implement `plugins.ts`**

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { settingsPath, pluginsCacheDir } from "./paths.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-plugins");

export interface PluginInfo {
  readonly id: string;
  readonly name: string;
  readonly marketplace: string;
  readonly version: string;
  readonly cachePath: string;
  readonly manifestPath: string;
  readonly description?: string;
  readonly enabled: boolean;
}

function readEnabledMap(): Record<string, boolean> {
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as { enabledPlugins?: Record<string, boolean> };
    return parsed.enabledPlugins ?? {};
  } catch { return {}; }
}

export function scanInstalledPlugins(): PluginInfo[] {
  const enabled = readEnabledMap();
  const out: PluginInfo[] = [];
  let marketplaces: string[];
  try { marketplaces = readdirSync(pluginsCacheDir()); } catch { return []; }
  for (const mp of marketplaces) {
    if (mp.startsWith(".")) continue;
    const mpDir = join(pluginsCacheDir(), mp);
    let pluginNames: string[];
    try { pluginNames = readdirSync(mpDir); } catch { continue; }
    for (const name of pluginNames) {
      if (name.startsWith(".")) continue;
      const nameDir = join(mpDir, name);
      let versions: string[];
      try { versions = readdirSync(nameDir).sort(); } catch { continue; }
      const picked = versions.find((v) => {
        try { return statSync(join(nameDir, v, ".claude-plugin", "plugin.json")).isFile(); } catch { return false; }
      });
      if (!picked) continue;
      const cachePath = join(nameDir, picked);
      const manifestPath = join(cachePath, ".claude-plugin", "plugin.json");
      let manifest: Record<string, unknown> = {};
      try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>; }
      catch (err) { log.error("manifest parse failed", { manifestPath, err: String(err) }); continue; }
      const id = `${name}@${mp}`;
      out.push({
        id,
        name,
        marketplace: mp,
        version: typeof manifest.version === "string" ? manifest.version : picked,
        cachePath,
        manifestPath,
        description: typeof manifest.description === "string" ? manifest.description : undefined,
        enabled: enabled[id] === true,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
```

- [ ] **Step 2.4: Run test — expect PASS**

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/claude-code/plugins.ts tests/integration/plugins.test.ts
git commit -m "feat(claude-code): scan installed plugins from cache"
```

---

## Task 3: Skills scanner + YAML front-matter parser

**Files:**
- Create: `src/lib/claude-code/skills.ts`
- Create: `tests/integration/skills.test.ts`

- [ ] **Step 3.1: Write failing test**

```ts
// tests/integration/skills.test.ts
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
```

- [ ] **Step 3.2: Run — expect FAIL**

- [ ] **Step 3.3: Implement `skills.ts`**

```ts
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PluginInfo } from "./plugins.ts";
import { userSkillsDir } from "./paths.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-skills");

export interface SkillInfo {
  readonly id: string;
  readonly name: string;
  readonly plugin: string;
  readonly marketplace?: string;
  readonly description: string;
  readonly path: string;
  readonly kind: "rigid" | "flexible";
  readonly enabled: boolean;
  readonly userLevel: boolean;
}

interface FrontMatter {
  readonly name?: string;
  readonly description?: string;
  readonly raw: Record<string, string>;
}

export function parseFrontMatter(text: string): FrontMatter {
  if (!text.startsWith("---")) return { raw: {} };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { raw: {} };
  const block = text.slice(3, end).trim();
  const raw: Record<string, string> = {};
  let currentKey: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (currentKey) raw[currentKey] = buf.join("\n").trim().replace(/^"|"$/g, "");
  };
  for (const line of block.split("\n")) {
    const m = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(line);
    if (m && !line.startsWith(" ") && !line.startsWith("\t")) {
      flush();
      currentKey = m[1]!;
      buf = [m[2]!];
    } else if (currentKey) {
      buf.push(line.trim());
    }
  }
  flush();
  return { name: raw.name, description: raw.description, raw };
}

function kindFromDescription(desc: string): "rigid" | "flexible" {
  const d = desc.toLowerCase();
  if (/\brigid\b|\bmust\b|\balways\b|follow exactly|verbatim/.test(d)) return "rigid";
  return "flexible";
}

function readSkillFile(path: string): { fm: FrontMatter; body: string } | null {
  try {
    const text = readFileSync(path, "utf8");
    const fm = parseFrontMatter(text);
    return { fm, body: text };
  } catch (err) {
    log.error("skill read failed", { path, err: String(err) });
    return null;
  }
}

export function scanSkills(plugins: readonly PluginInfo[]): SkillInfo[] {
  const out: SkillInfo[] = [];
  for (const p of plugins) {
    const skillsRoot = join(p.cachePath, "skills");
    let names: string[];
    try { names = readdirSync(skillsRoot); } catch { continue; }
    for (const n of names) {
      if (n.startsWith(".")) continue;
      const skillMd = join(skillsRoot, n, "SKILL.md");
      try { if (!statSync(skillMd).isFile()) continue; } catch { continue; }
      const parsed = readSkillFile(skillMd);
      if (!parsed) continue;
      const name = parsed.fm.name ?? n;
      const desc = parsed.fm.description ?? "";
      out.push({
        id: `${p.name}:${name}`,
        name,
        plugin: p.name,
        marketplace: p.marketplace,
        description: desc,
        path: skillMd,
        kind: kindFromDescription(desc),
        enabled: p.enabled,
        userLevel: false,
      });
    }
  }
  try {
    for (const n of readdirSync(userSkillsDir())) {
      if (n.startsWith(".")) continue;
      const skillMd = join(userSkillsDir(), n, "SKILL.md");
      try { if (!statSync(skillMd).isFile()) continue; } catch { continue; }
      const parsed = readSkillFile(skillMd);
      if (!parsed) continue;
      const name = parsed.fm.name ?? n;
      const desc = parsed.fm.description ?? "";
      out.push({
        id: `user:${name}`,
        name,
        plugin: "user",
        description: desc,
        path: skillMd,
        kind: kindFromDescription(desc),
        enabled: true,
        userLevel: true,
      });
    }
  } catch { /* no user skills dir */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkillBody(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}
```

- [ ] **Step 3.4: Run test — expect PASS**

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/claude-code/skills.ts tests/integration/skills.test.ts
git commit -m "feat(claude-code): scan skills from plugin caches and user dir"
```

---

## Task 4: Skill invocation stats

**Files:**
- Create: `src/lib/claude-code/skill-stats.ts`
- Create: `tests/integration/skill-stats.test.ts`

- [ ] **Step 4.1: Write failing test**

```ts
// tests/integration/skill-stats.test.ts
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
```

- [ ] **Step 4.2: Run — expect FAIL**

- [ ] **Step 4.3: Implement `skill-stats.ts`**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { projectsDir } from "./paths.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-skill-stats");

export interface SkillInvocation {
  readonly skillName: string;
  readonly sessionId: string;
  readonly ts: number;
  readonly ok: boolean;
  readonly prompt: string;
  readonly file: string;
}

interface Cache {
  byFile: Map<string, { mtime: number; invs: SkillInvocation[] }>;
}
const cache: Cache = { byFile: new Map() };

const SLASH_RE = /^\/(?:([a-z0-9-]+):)?([a-z0-9-]+)\b/;

function parseFile(path: string): SkillInvocation[] {
  const out: SkillInvocation[] = [];
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { return out; }
  let sessionId = path.split("/").pop()!.replace(/\.jsonl$/, "");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let rec: Record<string, unknown>;
    try { rec = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (typeof rec.sessionId === "string") sessionId = rec.sessionId;
    const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : 0;
    const type = rec.type;
    if (type === "user") {
      const m = rec.message as Record<string, unknown> | undefined;
      const c = m?.content;
      let text: string | null = null;
      if (typeof c === "string") text = c;
      else if (Array.isArray(c)) {
        for (const b of c) {
          if (b && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string") {
            text = (b as { text: string }).text; break;
          }
        }
      }
      if (text) {
        const mm = SLASH_RE.exec(text);
        if (mm) out.push({ skillName: mm[2]!, sessionId, ts, ok: true, prompt: text.slice(0, 140), file: path });
      }
    } else if (type === "assistant") {
      const m = rec.message as Record<string, unknown> | undefined;
      const content = m?.content;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b && typeof b === "object"
            && (b as { type?: unknown }).type === "tool_use"
            && (b as { name?: unknown }).name === "Skill") {
            const input = (b as { input?: unknown }).input;
            if (input && typeof input === "object") {
              const skill = (input as { skill?: unknown }).skill;
              if (typeof skill === "string") {
                out.push({ skillName: skill.split(":").pop() ?? skill, sessionId, ts, ok: true, prompt: "", file: path });
              }
            }
          }
        }
      }
    }
  }
  return out;
}

export function scanSkillInvocations(sinceMs?: number): SkillInvocation[] {
  const all: SkillInvocation[] = [];
  let dirs: string[];
  try { dirs = readdirSync(projectsDir()); } catch { return []; }
  for (const d of dirs) {
    const dd = join(projectsDir(), d);
    let files: string[];
    try { files = readdirSync(dd).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const path = join(dd, f);
      let mt = 0;
      try { mt = statSync(path).mtimeMs; } catch { continue; }
      const c = cache.byFile.get(path);
      let invs: SkillInvocation[];
      if (c && c.mtime === mt) invs = c.invs;
      else {
        invs = parseFile(path);
        cache.byFile.set(path, { mtime: mt, invs });
      }
      for (const inv of invs) {
        if (sinceMs && inv.ts < sinceMs) continue;
        all.push(inv);
      }
    }
  }
  log.debug("scan complete", { count: all.length });
  return all.sort((a, b) => b.ts - a.ts);
}
```

- [ ] **Step 4.4: Run test — expect PASS**

- [ ] **Step 4.5: Commit**

```bash
git add src/lib/claude-code/skill-stats.ts tests/integration/skill-stats.test.ts
git commit -m "feat(claude-code): count skill invocations from session JSONL"
```

---

## Task 5: MCP config read/write

**Files:**
- Create: `src/lib/claude-code/mcp-config.ts`
- Create: `tests/integration/mcp-config.test.ts`

- [ ] **Step 5.1: Write failing test**

```ts
// tests/integration/mcp-config.test.ts
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
```

- [ ] **Step 5.2: Run — expect FAIL**

- [ ] **Step 5.3: Implement `mcp-config.ts`**

```ts
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { settingsPath } from "./paths.ts";

export interface McpServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly transport?: "stdio" | "sse" | "websocket";
  readonly timeoutMs?: number;
}

export interface McpServersView {
  readonly enabled: Record<string, McpServerConfig>;
  readonly disabled: Record<string, McpServerConfig>;
}

type Settings = {
  mcpServers?: Record<string, McpServerConfig>;
  cockpit?: { disabledMcpServers?: Record<string, McpServerConfig> };
  [k: string]: unknown;
};

export function settingsFilePath(): string { return settingsPath(); }

function readRaw(): Settings {
  try {
    const txt = readFileSync(settingsPath(), "utf8");
    return JSON.parse(txt) as Settings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function writeRaw(s: Settings): void {
  const tmp = settingsPath() + ".cockpit.tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", "utf8");
  renameSync(tmp, settingsPath());
}

export function readMcpServers(): McpServersView {
  const s = readRaw();
  return {
    enabled: s.mcpServers ?? {},
    disabled: s.cockpit?.disabledMcpServers ?? {},
  };
}

export function toggleMcpServer(name: string): { enabled: boolean } {
  const s = readRaw();
  const enabled = s.mcpServers ?? {};
  const cockpit = s.cockpit ?? {};
  const disabled = cockpit.disabledMcpServers ?? {};
  if (enabled[name]) {
    disabled[name] = enabled[name]!;
    delete enabled[name];
    s.mcpServers = enabled;
    s.cockpit = { ...cockpit, disabledMcpServers: disabled };
    writeRaw(s);
    return { enabled: false };
  }
  if (disabled[name]) {
    enabled[name] = disabled[name]!;
    delete disabled[name];
    s.mcpServers = enabled;
    s.cockpit = { ...cockpit, disabledMcpServers: disabled };
    writeRaw(s);
    return { enabled: true };
  }
  throw new Error(`server ${name} not found`);
}

export function addMcpServer(name: string, cfg: McpServerConfig, opts?: { overwrite?: boolean }): void {
  const s = readRaw();
  const enabled = s.mcpServers ?? {};
  const disabled = s.cockpit?.disabledMcpServers ?? {};
  if ((enabled[name] || disabled[name]) && !opts?.overwrite) {
    throw Object.assign(new Error(`server ${name} already exists`), { code: "EEXIST" });
  }
  delete disabled[name];
  enabled[name] = cfg;
  s.mcpServers = enabled;
  s.cockpit = { ...(s.cockpit ?? {}), disabledMcpServers: disabled };
  writeRaw(s);
}

export function removeMcpServer(name: string): void {
  const s = readRaw();
  const enabled = s.mcpServers ?? {};
  const disabled = s.cockpit?.disabledMcpServers ?? {};
  delete enabled[name];
  delete disabled[name];
  s.mcpServers = enabled;
  s.cockpit = { ...(s.cockpit ?? {}), disabledMcpServers: disabled };
  writeRaw(s);
}

export function importMcpServers(payload: { mcpServers: Record<string, McpServerConfig> }, opts?: { overwrite?: boolean }): { added: string[]; skipped: string[] } {
  const added: string[] = [];
  const skipped: string[] = [];
  for (const [name, cfg] of Object.entries(payload.mcpServers)) {
    try { addMcpServer(name, cfg, opts); added.push(name); }
    catch { skipped.push(name); }
  }
  return { added, skipped };
}
```

- [ ] **Step 5.4: Run test — expect PASS**

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/claude-code/mcp-config.ts tests/integration/mcp-config.test.ts
git commit -m "feat(claude-code): mcp settings.json CRUD"
```

---

## Task 6: MCP probe + stats + logs (grouped, they're small)

**Files:**
- Create: `src/lib/claude-code/mcp-probe.ts`
- Create: `src/lib/claude-code/mcp-stats.ts`
- Create: `src/lib/claude-code/mcp-logs.ts`
- Create: `tests/integration/mcp-probe.test.ts`
- Create: `tests/integration/mcp-stats.test.ts`

- [ ] **Step 6.1: Implement `mcp-stats.ts`**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { projectsDir } from "./paths.ts";

export interface McpToolCall { readonly server: string; readonly tool: string; readonly ts: number; readonly ok: boolean; readonly sessionId: string; }

interface Cache { byFile: Map<string, { mtime: number; calls: McpToolCall[] }> }
const cache: Cache = { byFile: new Map() };

const NAME_RE = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/;

function parseFile(path: string): McpToolCall[] {
  const out: McpToolCall[] = [];
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { return out; }
  let sessionId = path.split("/").pop()!.replace(/\.jsonl$/, "");
  const toolResultIds = new Map<string, boolean>();
  const pending: { id: string; call: Omit<McpToolCall, "ok"> }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let rec: Record<string, unknown>;
    try { rec = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (typeof rec.sessionId === "string") sessionId = rec.sessionId;
    const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : 0;
    const msg = rec.message as Record<string, unknown> | undefined;
    const content = msg?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b || typeof b !== "object") continue;
        const bb = b as Record<string, unknown>;
        if (bb.type === "tool_use" && typeof bb.name === "string") {
          const m = NAME_RE.exec(bb.name);
          if (m) pending.push({ id: String(bb.id ?? ""), call: { server: m[1]!, tool: m[2]!, ts, sessionId } });
        } else if (bb.type === "tool_result") {
          const id = typeof bb.tool_use_id === "string" ? bb.tool_use_id : "";
          toolResultIds.set(id, bb.is_error !== true);
        }
      }
    }
  }
  for (const p of pending) {
    const ok = p.id ? toolResultIds.get(p.id) ?? true : true;
    out.push({ ...p.call, ok });
  }
  return out;
}

export function scanMcpCalls(): McpToolCall[] {
  const all: McpToolCall[] = [];
  let dirs: string[];
  try { dirs = readdirSync(projectsDir()); } catch { return []; }
  for (const d of dirs) {
    const dd = join(projectsDir(), d);
    let files: string[];
    try { files = readdirSync(dd).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const path = join(dd, f);
      let mt = 0;
      try { mt = statSync(path).mtimeMs; } catch { continue; }
      const c = cache.byFile.get(path);
      let calls: McpToolCall[];
      if (c && c.mtime === mt) calls = c.calls;
      else { calls = parseFile(path); cache.byFile.set(path, { mtime: mt, calls }); }
      for (const c2 of calls) all.push(c2);
    }
  }
  return all.sort((a, b) => b.ts - a.ts);
}

export function aggregateByServer(calls: readonly McpToolCall[]): Map<string, { count: number; ok: number; err: number; lastTs: number; tools: Map<string, { count: number; lastTs: number }> }> {
  const out = new Map<string, { count: number; ok: number; err: number; lastTs: number; tools: Map<string, { count: number; lastTs: number }> }>();
  for (const c of calls) {
    const s = out.get(c.server) ?? { count: 0, ok: 0, err: 0, lastTs: 0, tools: new Map() };
    s.count++;
    if (c.ok) s.ok++; else s.err++;
    if (c.ts > s.lastTs) s.lastTs = c.ts;
    const t = s.tools.get(c.tool) ?? { count: 0, lastTs: 0 };
    t.count++;
    if (c.ts > t.lastTs) t.lastTs = c.ts;
    s.tools.set(c.tool, t);
    out.set(c.server, s);
  }
  return out;
}
```

- [ ] **Step 6.2: Write test for `mcp-stats.ts`**

```ts
// tests/integration/mcp-stats.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

const SESS = [
  JSON.stringify({ type: "assistant", sessionId: "s1", timestamp: "2026-04-19T10:00:00Z", message: { content: [{ type: "tool_use", id: "tu1", name: "mcp__posthog__query", input: {} }] } }),
  JSON.stringify({ type: "user", sessionId: "s1", timestamp: "2026-04-19T10:00:01Z", message: { content: [{ type: "tool_result", tool_use_id: "tu1", is_error: false }] } }),
  JSON.stringify({ type: "assistant", sessionId: "s1", timestamp: "2026-04-19T10:01:00Z", message: { content: [{ type: "tool_use", id: "tu2", name: "mcp__posthog__query", input: {} }] } }),
  JSON.stringify({ type: "user", sessionId: "s1", timestamp: "2026-04-19T10:01:01Z", message: { content: [{ type: "tool_result", tool_use_id: "tu2", is_error: true }] } }),
].join("\n");

describe("scanMcpCalls + aggregateByServer", () => {
  let fx: Fixture;
  beforeEach(() => { fx = makeClaudeHome({ sessions: { "p/s1.jsonl": SESS } }); process.env.COCKPIT_CLAUDE_HOME = fx.home; });
  afterEach(() => { delete process.env.COCKPIT_CLAUDE_HOME; });

  it("counts calls and errors per server", async () => {
    const { scanMcpCalls, aggregateByServer } = await import("../../src/lib/claude-code/mcp-stats.ts");
    const agg = aggregateByServer(scanMcpCalls());
    const s = agg.get("posthog")!;
    expect(s.count).toBe(2);
    expect(s.ok).toBe(1);
    expect(s.err).toBe(1);
    expect(s.tools.get("query")!.count).toBe(2);
  });
});
```

- [ ] **Step 6.3: Implement `mcp-logs.ts`**

```ts
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { debugDir } from "./paths.ts";

export function tailMcpLogs(serverName: string, maxLines: number): string[] {
  const out: string[] = [];
  let files: string[];
  try { files = readdirSync(debugDir()); } catch { return []; }
  const sorted = files
    .map((f) => {
      const p = join(debugDir(), f);
      try { return { p, mt: statSync(p).mtimeMs }; } catch { return null; }
    })
    .filter((x): x is { p: string; mt: number } => x !== null)
    .sort((a, b) => b.mt - a.mt)
    .slice(0, 5);
  const needle = serverName.toLowerCase();
  for (const { p } of sorted) {
    let txt: string;
    try { txt = readFileSync(p, "utf8"); } catch { continue; }
    const lines = txt.split("\n").filter((l) => l.toLowerCase().includes(needle));
    for (const l of lines) {
      out.push(l);
      if (out.length >= maxLines) return out;
    }
  }
  return out;
}
```

- [ ] **Step 6.4: Implement `mcp-probe.ts`**

```ts
import { spawn } from "node:child_process";
import type { McpServerConfig } from "./mcp-config.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-mcp-probe");

export interface ProbeResult {
  readonly ok: boolean;
  readonly tools: readonly string[];
  readonly latencyMs: number;
  readonly error?: string;
  readonly skipped?: boolean;
  readonly reason?: string;
}

const cache = new Map<string, { res: ProbeResult; exp: number }>();
const CACHE_MS = 30_000;

export async function probeMcpServer(name: string, cfg: McpServerConfig, opts?: { timeoutMs?: number; bypassCache?: boolean }): Promise<ProbeResult> {
  if (!opts?.bypassCache) {
    const c = cache.get(name);
    if (c && c.exp > Date.now()) return c.res;
  }
  if (cfg.transport && cfg.transport !== "stdio") {
    const res: ProbeResult = { ok: false, tools: [], latencyMs: 0, skipped: true, reason: `transport ${cfg.transport} not supported for test` };
    cache.set(name, { res, exp: Date.now() + CACHE_MS });
    return res;
  }
  const timeout = opts?.timeoutMs ?? 5_000;
  const start = performance.now();
  return await new Promise<ProbeResult>((resolve) => {
    let resolved = false;
    const finish = (r: ProbeResult) => {
      if (resolved) return;
      resolved = true;
      cache.set(name, { res: r, exp: Date.now() + CACHE_MS });
      try { child.kill("SIGKILL"); } catch { /* */ }
      resolve(r);
    };
    const child = spawn(cfg.command, [...(cfg.args ?? [])], {
      env: { ...process.env, ...(cfg.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "";
    let tools: string[] = [];
    let initialized = false;
    const to = setTimeout(() => finish({ ok: false, tools: [], latencyMs: performance.now() - start, error: "timeout" }), timeout);
    to.unref();
    child.on("error", (err) => { clearTimeout(to); finish({ ok: false, tools: [], latencyMs: performance.now() - start, error: String(err) }); });
    child.stderr.on("data", (d) => log.debug("stderr", { name, chunk: String(d).slice(0, 200) }));
    child.stdout.on("data", (d) => {
      buf += String(d);
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let rec: Record<string, unknown>;
        try { rec = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
        const result = rec.result as Record<string, unknown> | undefined;
        if (!initialized && result) {
          initialized = true;
          const caps = result.capabilities as Record<string, unknown> | undefined;
          const declTools = caps?.tools;
          child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "notifications/initialized" }) + "\n");
          if (declTools) {
            child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }) + "\n");
          } else {
            clearTimeout(to);
            finish({ ok: true, tools: [], latencyMs: performance.now() - start });
          }
        } else if (initialized && result && Array.isArray(result.tools)) {
          for (const t of result.tools as Array<Record<string, unknown>>) {
            if (typeof t.name === "string") tools.push(t.name);
          }
          clearTimeout(to);
          finish({ ok: true, tools, latencyMs: performance.now() - start });
        }
      }
    });
    child.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "cockpit", version: "0.1.0" } },
    }) + "\n");
  });
}
```

- [ ] **Step 6.5: Write probe test** (stub MCP server in Node)

```ts
// tests/integration/mcp-probe.test.ts
import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeMcpServer } from "../../src/lib/claude-code/mcp-probe.ts";

const STUB = `
let buf = "";
process.stdin.on("data", (d) => {
  buf += String(d);
  let idx;
  while ((idx = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    try {
      const r = JSON.parse(line);
      if (r.method === "initialize") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: { capabilities: { tools: {} } } }) + "\\n");
      } else if (r.method === "tools/list") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: { tools: [{ name: "echo" }, { name: "ping" }] } }) + "\\n");
      }
    } catch {}
  }
});
`;

describe("probeMcpServer", () => {
  it("returns tools from stub server", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-stub-"));
    const stub = join(dir, "stub.mjs");
    writeFileSync(stub, STUB);
    const res = await probeMcpServer("stub", { command: process.execPath, args: [stub] }, { bypassCache: true, timeoutMs: 3000 });
    expect(res.ok).toBe(true);
    expect(res.tools).toEqual(expect.arrayContaining(["echo", "ping"]));
  });

  it("skips non-stdio transports", async () => {
    const res = await probeMcpServer("sse", { command: "x", transport: "sse" }, { bypassCache: true });
    expect(res.skipped).toBe(true);
  });
});
```

- [ ] **Step 6.6: Run all tests — expect PASS**

```bash
pnpm test -- mcp
```

- [ ] **Step 6.7: Commit**

```bash
git add src/lib/claude-code/mcp-{probe,stats,logs}.ts tests/integration/mcp-{probe,stats}.test.ts
git commit -m "feat(claude-code): mcp probe, stats and log tailing"
```

---

## Task 7: Skills API routes

**Files:**
- Create: `src/app/api/skills/route.ts`
- Create: `src/app/api/skills/[id]/body/route.ts`
- Create: `src/app/api/skills/[id]/invocations/route.ts`
- Create: `src/app/api/skills/toggle/route.ts`

- [ ] **Step 7.1: Implement `GET /api/skills`**

```ts
// src/app/api/skills/route.ts
import { NextResponse } from "next/server";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanSkills } from "@/lib/claude-code/skills";
import { scanSkillInvocations } from "@/lib/claude-code/skill-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const plugins = scanInstalledPlugins();
  const skills = scanSkills(plugins);
  const now = Date.now();
  const invs = scanSkillInvocations();
  const counts7 = new Map<string, { count: number; lastTs: number }>();
  const counts30 = new Map<string, number>();
  for (const i of invs) {
    if (i.ts > now - 7 * 24 * 3600 * 1000) {
      const e = counts7.get(i.skillName) ?? { count: 0, lastTs: 0 };
      e.count++; e.lastTs = Math.max(e.lastTs, i.ts);
      counts7.set(i.skillName, e);
    }
    if (i.ts > now - 30 * 24 * 3600 * 1000) counts30.set(i.skillName, (counts30.get(i.skillName) ?? 0) + 1);
  }
  return NextResponse.json({
    skills: skills.map((s) => ({
      ...s,
      invocations7d: counts7.get(s.name)?.count ?? 0,
      invocations30d: counts30.get(s.name) ?? 0,
      lastTs: counts7.get(s.name)?.lastTs ?? null,
    })),
    totals: { total: skills.length, enabled: skills.filter((s) => s.enabled).length },
  });
}
```

- [ ] **Step 7.2: Implement `GET /api/skills/[id]/body`**

```ts
// src/app/api/skills/[id]/body/route.ts
import { NextResponse } from "next/server";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanSkills, readSkillBody } from "@/lib/claude-code/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const skill = scanSkills(scanInstalledPlugins()).find((s) => s.id === id);
  if (!skill) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = readSkillBody(skill.path);
  if (body == null) return NextResponse.json({ error: "unreadable" }, { status: 500 });
  return NextResponse.json({ body });
}
```

- [ ] **Step 7.3: Implement `GET /api/skills/[id]/invocations`**

```ts
// src/app/api/skills/[id]/invocations/route.ts
import { NextResponse } from "next/server";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanSkills } from "@/lib/claude-code/skills";
import { scanSkillInvocations } from "@/lib/claude-code/skill-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 500);
  const skill = scanSkills(scanInstalledPlugins()).find((s) => s.id === id);
  if (!skill) return NextResponse.json({ error: "not found" }, { status: 404 });
  const all = scanSkillInvocations().filter((i) => i.skillName === skill.name).slice(0, limit);
  return NextResponse.json({ invocations: all });
}
```

- [ ] **Step 7.4: Implement `POST /api/skills/toggle`**

```ts
// src/app/api/skills/toggle/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { settingsPath } from "@/lib/claude-code/paths";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanSkills } from "@/lib/claude-code/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ skillId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { skillId } = parsed.data;
  const plugins = scanInstalledPlugins();
  const skill = scanSkills(plugins).find((s) => s.id === skillId);
  if (!skill) return NextResponse.json({ error: "skill not found" }, { status: 404 });
  if (skill.userLevel) return NextResponse.json({ error: "user-level skills cannot be toggled" }, { status: 400 });
  const plugin = plugins.find((p) => p.name === skill.plugin);
  if (!plugin) return NextResponse.json({ error: "parent plugin not found" }, { status: 404 });
  const path = settingsPath();
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>; }
  catch { raw = {}; }
  const enabledMap = (raw.enabledPlugins as Record<string, boolean> | undefined) ?? {};
  const newEnabled = !plugin.enabled;
  enabledMap[plugin.id] = newEnabled;
  raw.enabledPlugins = enabledMap;
  const tmp = path + ".cockpit.tmp";
  writeFileSync(tmp, JSON.stringify(raw, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
  const affected = scanSkills(scanInstalledPlugins()).filter((s) => s.plugin === plugin.name);
  return NextResponse.json({ ok: true, newEnabled, affectedSkills: affected });
}
```

- [ ] **Step 7.5: Verify routes compile**

```bash
pnpm typecheck
```

Expected: exit 0.

- [ ] **Step 7.6: Commit**

```bash
git add src/app/api/skills
git commit -m "feat(api): skills list, body, invocations, toggle"
```

---

## Task 8: MCP API routes

**Files:**
- Create: `src/app/api/mcp/route.ts`
- Create: `src/app/api/mcp/[id]/route.ts`
- Create: `src/app/api/mcp/[id]/tools/route.ts`
- Create: `src/app/api/mcp/[id]/logs/route.ts`
- Create: `src/app/api/mcp/toggle/route.ts`
- Create: `src/app/api/mcp/test/route.ts`
- Create: `src/app/api/mcp/import/route.ts`

- [ ] **Step 8.1: `GET /api/mcp` + `POST /api/mcp` (add)**

```ts
// src/app/api/mcp/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { readMcpServers, addMcpServer } from "@/lib/claude-code/mcp-config";
import { scanMcpCalls, aggregateByServer } from "@/lib/claude-code/mcp-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { enabled, disabled } = readMcpServers();
  const agg = aggregateByServer(scanMcpCalls());
  const toRow = (name: string, cfg: typeof enabled[string], status: "on" | "off") => {
    const s = agg.get(name);
    return {
      id: name,
      name,
      status,
      command: cfg.command,
      args: cfg.args ?? [],
      transport: cfg.transport ?? "stdio",
      timeoutMs: cfg.timeoutMs ?? 30000,
      envKeys: Object.keys(cfg.env ?? {}),
      callCount: s?.count ?? 0,
      okCount: s?.ok ?? 0,
      errCount: s?.err ?? 0,
      lastTs: s?.lastTs ?? null,
      toolCount: s?.tools.size ?? 0,
    };
  };
  const servers = [
    ...Object.entries(enabled).map(([k, v]) => toRow(k, v, "on")),
    ...Object.entries(disabled).map(([k, v]) => toRow(k, v, "off")),
  ];
  return NextResponse.json({ servers });
}

const AddBody = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(["stdio", "sse", "websocket"]).optional(),
  timeoutMs: z.number().int().positive().max(600000).optional(),
  overwrite: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = AddBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { name, overwrite, ...cfg } = parsed.data;
  try { addMcpServer(name, cfg, { overwrite }); }
  catch (err) {
    if ((err as { code?: string }).code === "EEXIST") return NextResponse.json({ error: "server exists" }, { status: 409 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8.2: `DELETE /api/mcp/[id]` + `GET /api/mcp/[id]`**

```ts
// src/app/api/mcp/[id]/route.ts
import { NextResponse } from "next/server";
import { readMcpServers, removeMcpServer } from "@/lib/claude-code/mcp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { enabled, disabled } = readMcpServers();
  const cfg = enabled[id] ?? disabled[id];
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id, enabled: Boolean(enabled[id]), config: cfg });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  removeMcpServer(id);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 8.3: `POST /api/mcp/toggle`**

```ts
// src/app/api/mcp/toggle/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleMcpServer } from "@/lib/claude-code/mcp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ serverId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  try {
    const res = toggleMcpServer(parsed.data.serverId);
    return NextResponse.json({ ok: true, enabled: res.enabled });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 404 }); }
}
```

- [ ] **Step 8.4: `POST /api/mcp/test`**

```ts
// src/app/api/mcp/test/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { readMcpServers } from "@/lib/claude-code/mcp-config";
import { probeMcpServer } from "@/lib/claude-code/mcp-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ serverId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { enabled, disabled } = readMcpServers();
  const cfg = enabled[parsed.data.serverId] ?? disabled[parsed.data.serverId];
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await probeMcpServer(parsed.data.serverId, cfg, { bypassCache: true });
  return NextResponse.json(result);
}
```

- [ ] **Step 8.5: `POST /api/mcp/import`**

```ts
// src/app/api/mcp/import/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { importMcpServers } from "@/lib/claude-code/mcp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  json: z.string().min(1),
  overwrite: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  let payload: unknown;
  try { payload = JSON.parse(parsed.data.json); } catch (err) { return NextResponse.json({ error: `invalid json: ${String(err)}` }, { status: 400 }); }
  const shape = z.object({ mcpServers: z.record(z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    transport: z.enum(["stdio", "sse", "websocket"]).optional(),
  })) });
  const v = shape.safeParse(payload);
  if (!v.success) return NextResponse.json({ error: "missing mcpServers object" }, { status: 400 });
  const res = importMcpServers(v.data, { overwrite: parsed.data.overwrite });
  return NextResponse.json({ ok: true, ...res });
}
```

- [ ] **Step 8.6: `GET /api/mcp/[id]/tools`**

```ts
// src/app/api/mcp/[id]/tools/route.ts
import { NextResponse } from "next/server";
import { readMcpServers } from "@/lib/claude-code/mcp-config";
import { probeMcpServer } from "@/lib/claude-code/mcp-probe";
import { scanMcpCalls, aggregateByServer } from "@/lib/claude-code/mcp-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { enabled, disabled } = readMcpServers();
  const cfg = enabled[id] ?? disabled[id];
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  const probe = await probeMcpServer(id, cfg).catch(() => null);
  const agg = aggregateByServer(scanMcpCalls()).get(id);
  const names = probe?.tools ?? Array.from(agg?.tools.keys() ?? []);
  const tools = names.map((n) => ({
    name: n,
    callCount: agg?.tools.get(n)?.count ?? 0,
    lastTs: agg?.tools.get(n)?.lastTs ?? null,
  }));
  return NextResponse.json({ tools, probeOk: probe?.ok ?? false, probeError: probe?.error, skipped: probe?.skipped });
}
```

- [ ] **Step 8.7: `GET /api/mcp/[id]/logs`**

```ts
// src/app/api/mcp/[id]/logs/route.ts
import { NextResponse } from "next/server";
import { tailMcpLogs } from "@/lib/claude-code/mcp-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const lines = Math.min(Math.max(Number(url.searchParams.get("lines")) || 200, 1), 2000);
  return NextResponse.json({ lines: tailMcpLogs(id, lines) });
}
```

- [ ] **Step 8.8: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 8.9: Commit**

```bash
git add src/app/api/mcp
git commit -m "feat(api): mcp list, detail, tools, logs, toggle, test, import"
```

---

## Task 9: Skills client page

**Files:**
- Modify: `src/components/views/skills-page.tsx`
- Create: `src/components/views/skills/skill-detail.tsx`
- Create: `src/components/views/skills/skill-toggle-confirm.tsx`

- [ ] **Step 9.1: Replace `skills-page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SkillDetail } from "./skills/skill-detail";
import { SkillToggleConfirm } from "./skills/skill-toggle-confirm";

export interface SkillRow {
  id: string;
  name: string;
  plugin: string;
  marketplace?: string;
  description: string;
  path: string;
  kind: "rigid" | "flexible";
  enabled: boolean;
  userLevel: boolean;
  invocations7d: number;
  invocations30d: number;
  lastTs: number | null;
}

type Filter = "all" | "on" | "off";

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<SkillRow | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/skills", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { skills: SkillRow[] };
      setSkills(data.skills);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, [refresh]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return skills.filter((s) => {
      if (filter === "on" && !s.enabled) return false;
      if (filter === "off" && s.enabled) return false;
      if (!qq) return true;
      return s.name.toLowerCase().includes(qq) || s.plugin.toLowerCase().includes(qq) || s.description.toLowerCase().includes(qq);
    });
  }, [skills, q, filter]);

  const active = skills.find((s) => s.id === selectedId) ?? filtered[0] ?? null;

  const onToggle = async (skill: SkillRow) => {
    if (skill.userLevel) return;
    const siblings = skills.filter((s) => s.plugin === skill.plugin);
    if (siblings.length > 1) { setConfirmToggle(skill); return; }
    await performToggle(skill.id);
  };

  const performToggle = async (skillId: string) => {
    const r = await fetch("/api/skills/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ skillId }) });
    if (r.ok) await refresh();
    setConfirmToggle(null);
  };

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>Skills</h1>
          <p className="sub">Installed skills from plugins. Skills guide how Claude approaches tasks — rigid ones run verbatim, flexible ones adapt to context.</p>
        </div>
        <div className="right">
          <button className="btn" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Reload"}</button>
        </div>
      </div>

      {err && <div style={{ padding: 12, background: "rgba(239,68,68,0.08)", color: "var(--state-error)", borderRadius: 4, marginBottom: 12, fontSize: 12 }}>Error: {err}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <div className="model-picker">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>all · {skills.length}</button>
          <button className={filter === "on" ? "on" : ""} onClick={() => setFilter("on")}>enabled · {skills.filter((s) => s.enabled).length}</button>
          <button className={filter === "off" ? "on" : ""} onClick={() => setFilter("off")}>disabled · {skills.filter((s) => !s.enabled).length}</button>
        </div>
        <input
          style={{ marginLeft: "auto", width: 280, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11.5, color: "var(--fg)" }}
          placeholder="Filter skills…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mcp-grid">
        <div className="mcp-list">
          {filtered.map((s) => (
            <button key={s.id} className={`mcp-item ${s.id === active?.id ? "active" : ""}`} onClick={() => setSelectedId(s.id)}>
              <span className={`mcp-dot ${s.enabled ? "on" : "off"}`} />
              <div className="meta">
                <span className="name">{s.name}</span>
                <span className="desc">{s.plugin}</span>
              </div>
              <span className="tool-count">{s.invocations7d}</span>
            </button>
          ))}
          {filtered.length === 0 && !loading && <div style={{ padding: 24, textAlign: "center", color: "var(--fg-muted)", fontSize: 11.5 }}>No matches.</div>}
        </div>

        {active && <SkillDetail skill={active} onToggle={() => onToggle(active)} />}
      </div>

      {confirmToggle && (
        <SkillToggleConfirm
          skill={confirmToggle}
          siblings={skills.filter((s) => s.plugin === confirmToggle.plugin)}
          onCancel={() => setConfirmToggle(null)}
          onConfirm={() => performToggle(confirmToggle.id)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 9.2: Create `skill-detail.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { SkillRow } from "../skills-page";

interface Invocation { skillName: string; sessionId: string; ts: number; ok: boolean; prompt: string; }

export function SkillDetail({ skill, onToggle }: { skill: SkillRow; onToggle: () => void }) {
  const [body, setBody] = useState<string | null>(null);
  const [showBody, setShowBody] = useState(false);
  const [invs, setInvs] = useState<Invocation[]>([]);

  useEffect(() => {
    setBody(null); setShowBody(false);
    fetch(`/api/skills/${encodeURIComponent(skill.id)}/invocations?limit=20`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { invocations: [] })
      .then((j: { invocations: Invocation[] }) => setInvs(j.invocations))
      .catch(() => setInvs([]));
  }, [skill.id]);

  const loadBody = async () => {
    if (body != null) { setShowBody((v) => !v); return; }
    const r = await fetch(`/api/skills/${encodeURIComponent(skill.id)}/body`);
    const j = (await r.json()) as { body?: string };
    setBody(j.body ?? "(unavailable)");
    setShowBody(true);
  };

  return (
    <div className="mcp-detail">
      <div className="row-h">
        <h2>{skill.name}</h2>
        <span className="id">{skill.plugin}:{skill.name}</span>
        <span className="status-pill" style={!skill.enabled ? { color: "var(--fg-muted)", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px var(--border)" } : undefined}>
          {skill.enabled ? "enabled" : "disabled"}
        </span>
        <span className={`tperm ${skill.kind === "rigid" ? "ask" : ""}`} style={{ justifySelf: "unset" }}>{skill.kind}</span>
        <div className="right-actions">
          <button className="btn" onClick={loadBody}>{showBody ? "Hide body" : "View skill"}</button>
          {!skill.userLevel && <button className="btn" onClick={onToggle}>{skill.enabled ? "Disable" : "Enable"}</button>}
        </div>
      </div>

      <p style={{ margin: "0 0 18px", color: "var(--fg-dim)", fontSize: 13, lineHeight: 1.55 }}>{skill.description}</p>

      <div className="field-grid">
        <div className="k">Source</div>
        <div className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-muted)", paddingTop: 8 }}>{skill.path}</div>
        <div className="k">Trigger</div>
        <div className="v"><input defaultValue={`/${skill.userLevel ? "" : skill.plugin + ":"}${skill.name}`} readOnly /></div>
        <div className="k">Invocations (7d · 30d)</div>
        <div className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg)", paddingTop: 8 }}>{skill.invocations7d} · {skill.invocations30d}</div>
      </div>

      {showBody && body && (
        <pre style={{ maxHeight: 320, overflow: "auto", padding: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-dim)", marginBottom: 18, whiteSpace: "pre-wrap" }}>{body}</pre>
      )}

      <h3 style={{ margin: "0 0 10px", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-faint)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>Recent invocations</h3>
      <div className="tools-table">
        <div className="trow head"><span>session</span><span>prompt</span><span style={{ textAlign: "right" }}>when</span><span style={{ textAlign: "right" }}>ok</span></div>
        {invs.length === 0 && <div className="trow"><span className="tdesc" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)" }}>no invocations recorded</span></div>}
        {invs.map((r, i) => (
          <div key={`${r.sessionId}-${i}`} className="trow">
            <span className="tname">{r.sessionId.slice(0, 8)}</span>
            <span className="tdesc">{r.prompt || "(tool_use)"}</span>
            <span className="ncalls">{r.ts ? new Date(r.ts).toLocaleString() : "—"}</span>
            <span className={`tperm ${r.ok ? "" : "ask"}`} style={!r.ok ? { color: "var(--state-error)" } : undefined}>{r.ok ? "ok" : "err"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9.3: Create `skill-toggle-confirm.tsx`**

```tsx
"use client";

import type { SkillRow } from "../skills-page";

export function SkillToggleConfirm({ skill, siblings, onCancel, onConfirm }: {
  skill: SkillRow; siblings: SkillRow[]; onCancel: () => void; onConfirm: () => void;
}) {
  const action = skill.enabled ? "Disable" : "Enable";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>{action} plugin <span style={{ fontFamily: "var(--font-mono)" }}>{skill.plugin}</span>?</h2>
        <p style={{ fontSize: 12.5, color: "var(--fg-dim)", lineHeight: 1.55 }}>
          Skills can only be toggled by enabling/disabling their parent plugin. This action will {action.toLowerCase()} <strong>{siblings.length} skills</strong>:
        </p>
        <ul style={{ maxHeight: 200, overflow: "auto", margin: "10px 0", padding: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11.5, listStyle: "none" }}>
          {siblings.map((s) => <li key={s.id} style={{ padding: "2px 0" }}>{s.name}</li>)}
        </ul>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={onConfirm}>{action} plugin</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 9.4: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 9.5: Manual verification** — boot dev server, open `/skills`, verify list loads, toggle shows confirm modal, reload count updates.

- [ ] **Step 9.6: Commit**

```bash
git add src/components/views/skills-page.tsx src/components/views/skills/
git commit -m "feat(ui): skills page with real data and plugin-level toggle"
```

---

## Task 10: MCP client page

**Files:**
- Modify: `src/components/views/mcp-page.tsx`
- Create: `src/components/views/mcp/mcp-detail.tsx`
- Create: `src/components/views/mcp/mcp-add-modal.tsx`
- Create: `src/components/views/mcp/mcp-import-modal.tsx`
- Create: `src/components/views/mcp/mcp-logs-drawer.tsx`

- [ ] **Step 10.1: Rewrite `mcp-page.tsx`**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { McpDetail } from "./mcp/mcp-detail";
import { McpAddModal } from "./mcp/mcp-add-modal";
import { McpImportModal } from "./mcp/mcp-import-modal";

export interface ServerRow {
  id: string; name: string; status: "on" | "off";
  command: string; args: string[]; transport: string; timeoutMs: number;
  envKeys: string[]; callCount: number; okCount: number; errCount: number;
  lastTs: number | null; toolCount: number;
}

export function McpPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/mcp", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { servers: ServerRow[] };
      setServers(data.servers);
      setErr(null);
    } catch (e) { setErr(String(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, [refresh]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return servers.filter((s) => !qq || s.name.toLowerCase().includes(qq) || s.command.toLowerCase().includes(qq));
  }, [servers, q]);

  const active = servers.find((s) => s.id === activeId) ?? filtered[0] ?? null;

  const onToggle = async (id: string) => {
    await fetch("/api/mcp/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId: id }) });
    refresh();
  };
  const onDelete = async (id: string) => {
    if (!confirm(`Delete MCP server "${id}"?`)) return;
    await fetch(`/api/mcp/${encodeURIComponent(id)}`, { method: "DELETE" });
    setActiveId(null);
    refresh();
  };

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>MCP servers</h1>
          <p className="sub">Configure Model Context Protocol servers available to your sessions.</p>
        </div>
        <div className="right">
          <button className="btn" onClick={() => setImportOpen(true)}>Import config</button>
          <button className="btn primary" onClick={() => setAddOpen(true)}>Add server</button>
        </div>
      </div>

      {err && <div style={{ padding: 12, background: "rgba(239,68,68,0.08)", color: "var(--state-error)", borderRadius: 4, marginBottom: 12, fontSize: 12 }}>Error: {err}</div>}

      <div className="mcp-grid">
        <div className="mcp-list">
          <input className="search" placeholder="Filter servers…" value={q} onChange={(e) => setQ(e.target.value)} />
          {filtered.map((s) => (
            <button key={s.id} className={`mcp-item ${s.id === active?.id ? "active" : ""}`} onClick={() => setActiveId(s.id)}>
              <span className={`mcp-dot ${s.status}`} />
              <div className="meta">
                <span className="name">{s.name}</span>
                <span className="desc">{s.command}</span>
              </div>
              <span className="tool-count">{s.toolCount || s.callCount}</span>
            </button>
          ))}
          {filtered.length === 0 && !loading && <div style={{ padding: 24, textAlign: "center", color: "var(--fg-muted)", fontSize: 11.5 }}>No servers.</div>}
        </div>

        {active && <McpDetail server={active} onToggle={() => onToggle(active.id)} onDelete={() => onDelete(active.id)} onRefresh={refresh} />}
      </div>

      {addOpen && <McpAddModal onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); refresh(); }} />}
      {importOpen && <McpImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); refresh(); }} />}
    </div>
  );
}
```

- [ ] **Step 10.2: `mcp-detail.tsx`**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { ServerRow } from "../mcp-page";
import { McpLogsDrawer } from "./mcp-logs-drawer";

interface Tool { name: string; callCount: number; lastTs: number | null; }

export function McpDetail({ server, onToggle, onDelete, onRefresh }: {
  server: ServerRow; onToggle: () => void; onDelete: () => void; onRefresh: () => void;
}) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [probe, setProbe] = useState<{ ok?: boolean; tools?: string[]; latencyMs?: number; error?: string; skipped?: boolean; reason?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    setProbe(null);
    fetch(`/api/mcp/${encodeURIComponent(server.id)}/tools`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { tools: [] })
      .then((j: { tools: Tool[] }) => setTools(j.tools))
      .catch(() => setTools([]));
  }, [server.id]);

  const runTest = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/mcp/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId: server.id }) });
      setProbe(await r.json());
      onRefresh();
    } finally { setTesting(false); }
  };

  return (
    <div className="mcp-detail">
      <div className="row-h">
        <h2>{server.name}</h2>
        <span className="id">{server.transport} · timeout {server.timeoutMs}ms</span>
        {server.status === "on"  ? <span className="status-pill">enabled</span>
         : <span className="status-pill" style={{ color: "var(--fg-muted)", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px var(--border)" }}>disabled</span>}
        <div className="right-actions">
          <button className="btn" onClick={runTest} disabled={testing}>{testing ? "Testing…" : "Test connection"}</button>
          <button className="btn" onClick={() => setLogsOpen(true)}>View logs</button>
          <button className="btn" onClick={onToggle}>{server.status === "on" ? "Disable" : "Enable"}</button>
          <button className="btn" style={{ color: "var(--state-error)" }} onClick={onDelete}>Delete</button>
        </div>
      </div>

      {probe && (
        <div style={{ marginBottom: 14, padding: 10, borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)",
          background: probe.skipped ? "rgba(255,255,255,0.04)" : probe.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          color: probe.skipped ? "var(--fg-muted)" : probe.ok ? "var(--state-success, #22c55e)" : "var(--state-error)" }}>
          {probe.skipped ? `skipped: ${probe.reason}`
            : probe.ok ? `✓ ${probe.tools?.length ?? 0} tools · ${Math.round(probe.latencyMs ?? 0)}ms`
            : `✗ ${probe.error ?? "error"} · ${Math.round(probe.latencyMs ?? 0)}ms`}
        </div>
      )}

      <div className="field-grid">
        <div className="k">Command</div>
        <div className="v"><input defaultValue={[server.command, ...(server.args ?? [])].join(" ")} readOnly /></div>
        <div className="k">Transport</div>
        <div className="v"><input defaultValue={server.transport} readOnly style={{ maxWidth: 160 }} /></div>
        <div className="k">Env keys</div>
        <div className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-muted)", paddingTop: 8 }}>
          {server.envKeys.length ? server.envKeys.join(", ") : "(none)"}
        </div>
        <div className="k">Calls</div>
        <div className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg)", paddingTop: 8 }}>
          {server.callCount} total · {server.okCount} ok · {server.errCount} err {server.lastTs ? `· last ${new Date(server.lastTs).toLocaleString()}` : ""}
        </div>
      </div>

      <h3 style={{ margin: "0 0 10px", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-faint)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>Tools · {tools.length}</h3>
      <div className="tools-table">
        <div className="trow head"><span>name</span><span>last call</span><span style={{ textAlign: "right" }}>calls</span><span style={{ textAlign: "right" }}>&nbsp;</span></div>
        {tools.length === 0 && <div className="trow"><span className="tdesc" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)" }}>no tools discovered (try Test connection)</span></div>}
        {tools.map((t) => (
          <div key={t.name} className="trow">
            <span className="tname">{t.name}</span>
            <span className="tdesc">{t.lastTs ? new Date(t.lastTs).toLocaleString() : "—"}</span>
            <span className="ncalls">{t.callCount}</span>
            <span className="tperm auto">ready</span>
          </div>
        ))}
      </div>

      {logsOpen && <McpLogsDrawer serverId={server.id} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
```

- [ ] **Step 10.3: `mcp-add-modal.tsx`**

```tsx
"use client";

import { useState } from "react";

export function McpAddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("-y @modelcontextprotocol/server-filesystem ~/code");
  const [env, setEnv] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const envObj: Record<string, string> = {};
      for (const line of env.split("\n")) {
        const i = line.indexOf("=");
        if (i > 0) envObj[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
      const r = await fetch("/api/mcp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, command, args: args.split(/\s+/).filter(Boolean), env: envObj, transport: "stdio" }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({ error: `${r.status}` })); throw new Error(j.error); }
      onDone();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15 }}>Add MCP server</h2>
        <div className="field-grid">
          <div className="k">Name</div>
          <div className="v"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. filesystem" /></div>
          <div className="k">Command</div>
          <div className="v"><input value={command} onChange={(e) => setCommand(e.target.value)} /></div>
          <div className="k">Args</div>
          <div className="v"><input value={args} onChange={(e) => setArgs(e.target.value)} /></div>
          <div className="k">Env (KEY=VAL per line)</div>
          <div className="v"><textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)", padding: 6, fontFamily: "var(--font-mono)", fontSize: 11.5 }} /></div>
        </div>
        {err && <div style={{ color: "var(--state-error)", fontSize: 12, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy || !name || !command}>Add</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.4: `mcp-import-modal.tsx`**

```tsx
"use client";

import { useState } from "react";

export function McpImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [json, setJson] = useState('{\n  "mcpServers": {\n    \n  }\n}');
  const [overwrite, setOverwrite] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: string[]; skipped: string[] } | null>(null);

  const submit = async () => {
    setErr(null);
    try {
      const r = await fetch("/api/mcp/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json, overwrite }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setResult({ added: j.added, skipped: j.skipped });
      if (j.skipped.length === 0) onDone();
    } catch (e) { setErr(String(e)); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15 }}>Import MCP config</h2>
        <p style={{ fontSize: 12, color: "var(--fg-dim)", margin: "0 0 10px" }}>Paste a JSON object with an <code>mcpServers</code> key.</p>
        <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={14} style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)", padding: 10, fontFamily: "var(--font-mono)", fontSize: 11.5 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Overwrite existing servers with same name
        </label>
        {err && <div style={{ color: "var(--state-error)", fontSize: 12, marginTop: 10 }}>{err}</div>}
        {result && (
          <div style={{ fontSize: 12, marginTop: 10, color: "var(--fg-dim)" }}>
            Added: {result.added.join(", ") || "(none)"}<br />
            Skipped: {result.skipped.join(", ") || "(none)"}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={submit}>Import</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.5: `mcp-logs-drawer.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

export function McpLogsDrawer({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/mcp/${encodeURIComponent(serverId)}/logs?lines=300`, { cache: "no-store" });
        const j = (await r.json()) as { lines: string[] };
        if (!cancelled) setLines(j.lines);
      } catch { /* */ }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [serverId]);

  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines]);

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 560, background: "var(--bg-elev)", borderLeft: "1px solid var(--border)", zIndex: 90, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 12, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{serverId} · logs</strong>
        <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{lines.length} lines · polling 2s</span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={onClose}>Close</button>
      </div>
      <pre ref={ref} style={{ flex: 1, overflow: "auto", padding: 12, margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-dim)", whiteSpace: "pre-wrap" }}>
        {lines.length ? lines.join("\n") : "(no logs matching this server name in ~/.claude/debug/)"}
      </pre>
    </div>
  );
}
```

- [ ] **Step 10.6: Typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 10.7: Manual verification** — dev server, `/mcp`, add a test server, toggle it, test connection, open logs, delete it.

- [ ] **Step 10.8: Commit**

```bash
git add src/components/views/mcp-page.tsx src/components/views/mcp/
git commit -m "feat(ui): mcp page with real data, test, add, import, logs"
```

---

## Task 11: End-to-end integration test

**Files:**
- Create: `tests/integration/skills-mcp-api.test.ts`

- [ ] **Step 11.1: Write test hitting API routes via direct import** (Next routes are plain functions)

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeClaudeHome, type Fixture } from "./_fixtures.ts";

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
          skills: { brainstorming: `---\nname: brainstorming\ndescription: rigid\n---\nhi` },
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
    expect(j.skills.find((s: { name: string }) => s.name === "brainstorming")).toBeDefined();
  });

  it("POST /api/skills/toggle flips parent plugin", async () => {
    const { POST } = await import("../../src/app/api/skills/toggle/route.ts");
    const res = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ skillId: "superpowers:brainstorming" }) }));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.newEnabled).toBe(false);
  });

  it("GET /api/mcp lists enabled server", async () => {
    const { GET } = await import("../../src/app/api/mcp/route.ts");
    const res = await GET();
    const j = await res.json();
    expect(j.servers.find((s: { name: string }) => s.name === "posthog")).toBeDefined();
  });

  it("POST /api/mcp/toggle moves server to disabled", async () => {
    const { POST } = await import("../../src/app/api/mcp/toggle/route.ts");
    const r = await POST(new Request("http://x", { method: "POST", body: JSON.stringify({ serverId: "posthog" }) }));
    const j = await r.json();
    expect(j.enabled).toBe(false);
  });
});
```

- [ ] **Step 11.2: Run** — `pnpm test`

- [ ] **Step 11.3: Commit**

```bash
git add tests/integration/skills-mcp-api.test.ts
git commit -m "test(api): skills + mcp end-to-end via route handlers"
```

---

## Task 12: Final verification

- [ ] **Step 12.1: Full test suite**

```bash
pnpm test
```
Expected: all tests pass.

- [ ] **Step 12.2: Typecheck clean**

```bash
pnpm typecheck
```

- [ ] **Step 12.3: Build**

```bash
pnpm build
```
Expected: no errors.

- [ ] **Step 12.4: Dev server smoke test**

```bash
COCKPIT_MOCK=1 pnpm dev
```

Open `/skills` and `/mcp`, interact end-to-end. Verify against real `~/.claude/` data.

- [ ] **Step 12.5: Final commit** if any polish was needed.

---

## Self-Review

1. **Spec coverage:**
   - Skills list from filesystem + invocation counts: ✔ Task 3 + 4 + 7.1
   - SKILL.md body view: ✔ 7.2, 9.2
   - Skill toggle via parent plugin with warning: ✔ 7.4, 9.3
   - MCP list, toggle, add, delete, import, test, logs: ✔ 8.1–8.7, 10
   - `COCKPIT_CLAUDE_HOME` isolation: ✔ Task 1
   - File size ≤ 300 lines: ✔ all new files under this via splits
   - zod validation on mutating routes: ✔ 7.4, 8.1, 8.3–8.5
   - Probe caching 30 s: ✔ 6.4
   - Logs best-effort: ✔ 6.3 / 8.7

2. **Placeholder scan:** no TBD, no "similar to", every code step includes code.

3. **Type consistency:** `SkillInfo` / `PluginInfo` / `McpServerConfig` types defined once, reused across tasks. `SkillRow` and `ServerRow` are client-side mirrors matching API JSON shape. Function names consistent (`scanSkills`, `scanSkillInvocations`, `scanInstalledPlugins`, `readMcpServers`, `toggleMcpServer`, `probeMcpServer`).
