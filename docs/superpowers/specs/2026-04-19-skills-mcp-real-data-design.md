# Skills & MCP pages — real data, fully functional

Date: 2026-04-19
Scope: make `src/app/skills/` and `src/app/mcp/` 100% functional with real
filesystem sources and real invocation metrics. Option **C + C1 + M1**
(approved by user).

## Problem

`SkillsPage` and `McpPage` render hardcoded arrays. No API, no invocation
counts, no ability to enable/disable, test, or add servers.

## Real sources available

| Source | Contents |
|---|---|
| `~/.claude/settings.json` | `enabledPlugins`, `mcpServers`, authoritative for on/off + MCP config |
| `~/.claude/plugins/installed_plugins.json` | Installed plugin versions, scope, install paths |
| `~/.claude/plugins/known_marketplaces.json` | Marketplaces |
| `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/.claude-plugin/plugin.json` | Plugin manifest |
| `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/<skill>/SKILL.md` | Skill definition (front-matter + body) |
| `~/.claude/skills/<skill>/SKILL.md` | User-level skills |
| `~/.claude/projects/<slug>/<session>.jsonl` | Tool calls (`tool_use` with `name`), user prompts (for skill invocation counting) |
| `~/.claude/debug/*.log` | MCP runtime logs |

## Semantics decisions

### C1 — Skill enable/disable = plugin enable/disable

Skills are not individually toggleable in Claude Code. The only authoritative
flag is `settings.json.enabledPlugins["<plugin>@<marketplace>"]`. Disabling a
skill disables its entire parent plugin. The UI must surface this with a
warning: "this disables N skills: …".

User-level skills in `~/.claude/skills/` are always enabled (no flag). The UI
shows them as such and hides the toggle button.

### M1 — MCP Restart → Test connection, View logs → tail debug

Cockpit does not manage MCP process lifecycle. Instead:

- **Test connection**: spawn `command args` with env, send MCP `initialize`
  JSON-RPC over stdio, read response with 5 s timeout, SIGKILL child. Returns
  `{ok, tools: string[], latencyMs, error?}`.
- **View logs**: tail the last N lines of `~/.claude/debug/*.log` filtering
  lines that mention the server name. Best-effort; returns `[]` if nothing.
- sse / websocket transports: probe returns `{skipped: true, reason: "transport not supported for test"}`.

### Disabled MCP servers storage

To preserve config on toggle-off, disabled servers are moved from
`settings.mcpServers[name]` to `settings.cockpit.disabledMcpServers[name]`.
Toggle-on moves them back. Claude CLI ignores unknown top-level keys.

## New library modules (`src/lib/claude-code/`)

All are Node-only, used only from API routes. Pure where possible. All paths
derive from `claudeHome()` which returns `process.env.COCKPIT_CLAUDE_HOME ||
path.join(os.homedir(), ".claude")` — enables test isolation.

### `plugins.ts`
```ts
export interface PluginInfo {
  readonly id: string;           // "superpowers@claude-plugins-official"
  readonly name: string;
  readonly marketplace: string;
  readonly version: string;
  readonly cachePath: string;
  readonly manifestPath: string;
  readonly description?: string;
  readonly enabled: boolean;
}
export function scanInstalledPlugins(): PluginInfo[]
```

Reads `installed_plugins.json`; for each plugin picks the latest `version`
directory that has a `.claude-plugin/plugin.json`. Enabled = from
`settings.json.enabledPlugins`.

### `skills.ts`
```ts
export interface SkillInfo {
  readonly id: string;           // stable: "<plugin>:<skill>" or "user:<skill>"
  readonly name: string;
  readonly plugin: string;       // "user" for user-level
  readonly marketplace?: string;
  readonly description: string;
  readonly path: string;         // absolute path to SKILL.md
  readonly kind: "rigid" | "flexible";   // parsed from description or default "flexible"
  readonly enabled: boolean;     // parent plugin enabled, or true for user-level
  readonly userLevel: boolean;
}
export function scanSkills(plugins: readonly PluginInfo[]): SkillInfo[]
export function readSkillBody(skillId: string): string | null
```

Parses YAML front-matter with a minimal parser (no external dep — the schema is
tiny: `name`, `description`). `kind` defaults to `"flexible"` unless
description contains "rigid" or skill explicitly declares.

### `skill-stats.ts`
```ts
export interface SkillInvocation {
  readonly skillName: string;
  readonly sessionId: string;
  readonly ts: number;
  readonly ok: boolean;
  readonly prompt: string;       // truncated ≤ 140 chars
}
export function scanSkillInvocations(sinceMs?: number): SkillInvocation[]
```

Parses JSONL files under `~/.claude/projects/`. Counts:
1. `tool_use` where `name === "Skill"` → `input.skill` is the skill name.
2. User messages whose content matches `^/([a-z0-9-]+:)?([a-z0-9-]+)` — matches `/skill` or `/plugin:skill` invocations.

Uses the same 15 s TTL cache pattern as `history.ts`.

### `mcp-config.ts`
```ts
export interface McpServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly transport?: "stdio" | "sse" | "websocket";
  readonly timeoutMs?: number;
}
export function readSettings(): RawSettings
export function readMcpServers(): { enabled: Record<string, McpServerConfig>; disabled: Record<string, McpServerConfig> }
export function writeMcpServers(mutator: (s: RawSettings) => RawSettings): void
```

`writeMcpServers` reads, applies mutator, writes atomically via
`fs.writeFileSync(path + ".tmp", …)` then `rename`. Preserves JSON formatting
(2-space indent). Fails loudly if settings.json is missing or unparseable.

### `mcp-probe.ts`
```ts
export interface ProbeResult {
  readonly ok: boolean;
  readonly tools: readonly string[];
  readonly latencyMs: number;
  readonly error?: string;
  readonly skipped?: boolean;
  readonly reason?: string;
}
export async function probeMcpServer(
  name: string,
  cfg: McpServerConfig,
  opts?: { timeoutMs?: number },
): Promise<ProbeResult>
```

1. Reject transports other than `stdio` with `skipped`.
2. `child_process.spawn(cfg.command, cfg.args ?? [], { env: { ...process.env, ...cfg.env }, stdio: ["pipe", "pipe", "pipe"] })`.
3. Write `initialize` request: `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"cockpit","version":"0.0.1"}}}\n`.
4. Read until newline-delimited JSON arrives, parse `result.capabilities.tools` or issue a `tools/list` follow-up if the server exposes tools only on `tools/list`. Parse result.
5. Hard kill after 5 s. Return latency from `performance.now()` deltas.

### `mcp-stats.ts`
```ts
export function scanMcpInvocations(sinceMs?: number): Map<string, Map<string, { count: number; ok: number; lastTs: number }>>
```

Parses JSONL, finds `tool_use` blocks where `name` matches `^mcp__([^_]+)__(.+)$`. First group = server, second = tool. Pair with matching `tool_result` for ok/err. Uses cache.

### `mcp-logs.ts`
```ts
export function tailMcpLogs(serverName: string, lines: number): string[]
```

Best-effort. `readdirSync(~/.claude/debug/)`, pick most recent files, tail last
N lines total that contain `serverName`. Returns `[]` if directory missing.

## API routes

All `runtime = "nodejs"`, `dynamic = "force-dynamic"`. Input validated with
zod. Errors return `{error: string}` + appropriate status.

### Skills
- `GET /api/skills` → `{skills: (SkillInfo & {invocations7d: number; invocations30d: number; lastTs: number | null})[]}`
- `GET /api/skills/:id/body` → `{body: string}` (reads SKILL.md)
- `GET /api/skills/:id/invocations?limit=50` → `{invocations: SkillInvocation[]}`
- `POST /api/skills/toggle` — body `{skillId: string}` → toggles parent plugin. Response: `{ok, newEnabled, affectedSkills: SkillInfo[]}`. User-level skills → 400.

### MCP
- `GET /api/mcp` → `{servers: (McpServerPublic & {status: "on"|"off"|"err"; toolCount: number; callCount: number})[]}`
- `GET /api/mcp/:id` → full detail (config + last probe result cached)
- `POST /api/mcp/toggle` — body `{serverId}` → moves between `mcpServers` ↔ `cockpit.disabledMcpServers`
- `POST /api/mcp` — body `McpServerConfig & {name}` → add (409 if name exists)
- `DELETE /api/mcp/:id` — remove entirely
- `POST /api/mcp/import` — body `{json: string}` → parses as `{mcpServers: {…}}`, merges (409 on name conflict unless `overwrite: true`)
- `POST /api/mcp/test` — body `{serverId}` → probe; result also cached in memory for subsequent `GET /api/mcp`
- `GET /api/mcp/:id/logs?lines=200` → `{lines: string[]}`
- `GET /api/mcp/:id/tools` → `{tools: {name: string; callCount: number; lastTs: number | null}[]}` — uses last probe result merged with call stats

## Client components

Files kept ≤ 300 lines. Split as needed.

### Skills
- `src/components/views/skills-page.tsx` — shell, filter, list, selection state. ≤ 200 lines.
- `src/components/views/skills/skill-detail.tsx` — right pane: metadata, body preview, recent invocations.
- `src/components/views/skills/skill-toggle-confirm.tsx` — modal shown when toggle affects >1 skill.

Data: `useEffect` initial fetch, poll `/api/skills` every 15 s. Toggle does
optimistic update then rollback on error. Recent invocations lazy-loaded on
detail-pane open.

### MCP
- `src/components/views/mcp-page.tsx` — shell + list. ≤ 200 lines.
- `src/components/views/mcp/mcp-detail.tsx` — right pane: config, actions, tools table.
- `src/components/views/mcp/mcp-add-modal.tsx` — add new server form.
- `src/components/views/mcp/mcp-import-modal.tsx` — paste JSON.
- `src/components/views/mcp/mcp-logs-drawer.tsx` — tail logs, polls `/api/mcp/:id/logs` every 2 s while open.

Actions:
- **Test connection** → `POST /api/mcp/test`, inline result under button: `✓ 14 tools · 312ms` / `✗ timeout`.
- **Enable/Disable** → `POST /api/mcp/toggle`, optimistic.
- **Edit config** (added vs original spec): inline editable fields. Save →
  `POST /api/mcp` with `{overwrite: true}`. Decision: out of scope for first
  cut. Config fields remain read-only display. User must delete + re-add.
- **Delete** → `DELETE /api/mcp/:id`, confirm via native dialog.

## Error handling

- Settings.json missing → all list routes return empty, toggle routes return
  501 with message "settings.json not found".
- Malformed settings.json → 500 with parse error location.
- Plugin cache missing but enabled in settings → skill list omits, warning
  logged.
- Probe failure → result cached for 30 s so UI doesn't re-spawn on every
  refresh.

## Testing

Integration test under `tests/integration/skills-mcp.test.ts`:
1. Mock `~/.claude/` in a tmpdir via env override `COCKPIT_CLAUDE_HOME`.
2. Write a fake `settings.json`, a fake plugin cache with a SKILL.md, and a
   fake JSONL session with `tool_use` entries.
3. Hit `GET /api/skills`, assert invocation counts.
4. Hit `POST /api/skills/toggle`, assert settings.json mutated.
5. Hit `POST /api/mcp/test` with a stub server (tiny Node script that responds
   to `initialize`).

Unit tests for: YAML front-matter parser, skill invocation regex, mcp tool
name parser, settings writer round-trip.

## Non-goals

- No marketplace refresh (git pull). "Reload registry" button re-fetches the
  current disk state only.
- No hot-reload of running MCP processes. Toggles take effect on next session
  start.
- No editing env vars in UI (security — shell-like redaction concerns).
- No conversion between transports.
- No diff preview before settings.json writes.

## Files changed

New:
- `src/lib/claude-code/plugins.ts`
- `src/lib/claude-code/skills.ts`
- `src/lib/claude-code/skill-stats.ts`
- `src/lib/claude-code/mcp-config.ts`
- `src/lib/claude-code/mcp-probe.ts`
- `src/lib/claude-code/mcp-stats.ts`
- `src/lib/claude-code/mcp-logs.ts`
- `src/app/api/skills/route.ts`
- `src/app/api/skills/[id]/body/route.ts`
- `src/app/api/skills/[id]/invocations/route.ts`
- `src/app/api/skills/toggle/route.ts`
- `src/app/api/mcp/route.ts`
- `src/app/api/mcp/[id]/route.ts`
- `src/app/api/mcp/[id]/logs/route.ts`
- `src/app/api/mcp/[id]/tools/route.ts`
- `src/app/api/mcp/toggle/route.ts`
- `src/app/api/mcp/test/route.ts`
- `src/app/api/mcp/import/route.ts`
- `src/components/views/skills/skill-detail.tsx`
- `src/components/views/skills/skill-toggle-confirm.tsx`
- `src/components/views/mcp/mcp-detail.tsx`
- `src/components/views/mcp/mcp-add-modal.tsx`
- `src/components/views/mcp/mcp-import-modal.tsx`
- `src/components/views/mcp/mcp-logs-drawer.tsx`
- `tests/integration/skills-mcp.test.ts`

Modified:
- `src/components/views/skills-page.tsx` — replaced with fetch + state
- `src/components/views/mcp-page.tsx` — replaced with fetch + state
