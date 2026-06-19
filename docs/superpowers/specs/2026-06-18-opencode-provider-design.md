# OpenCode provider for Cockpit

Date: 2026-06-18

## Goal

Add the SST **opencode** CLI (`opencode`, opencode.ai) as a pilotable provider so it
appears as a choice in "New session", spawns through the existing PTY runner, and
flows through the history/metrics pipeline like the other providers. Ship a
search-filterable model picker for providers whose model list is large (opencode),
and an end-to-end test.

## Ground truth (verified on this machine)

- Binary: `~/.opencode/bin/opencode` v1.17.8. NOT on `PATH`, NOT in `resolveCliPath`'s
  search list. opencode's canonical install dir is `~/.opencode/bin`.
- Storage: SQLite at `~/.local/share/opencode/opencode.db` (honors `XDG_DATA_HOME`).
  No JSONL transcripts (unlike grok/codex).
- `session` table already holds real per-session aggregates:
  `id, project_id, directory (cwd), title, cost (real), tokens_input, tokens_output,
  tokens_reasoning, tokens_cache_read, tokens_cache_write, model (JSON), time_created,
  time_updated` (times in ms). `message`/`part`/`todo` tables hold transcript + todos.
  `model` column is JSON: `{"id","providerID","variant"}` -> apiId = `providerID/id`.
- Node 25 ships built-in `node:sqlite` (DatabaseSync) -> read the DB directly, no new dep.
- Auth: empty (0 credentials), yet `opencode models` returns 11 usable models
  (5 free `opencode/*` zen + 6 `zai-coding-plan/*` from the user's plan). A real headless
  run with a free zen model returns output and writes a real `session` row with zero auth.
- CLI flags: TUI is the default command; `--prompt` seeds it at launch (arg delivery,
  like grok/gemini). `-m provider/model` selects the model. `--variant high|max|minimal`
  is reasoning effort (left as future extension). `--dangerously-skip-permissions`.
  `-s <id>` / `-c` resume. `opencode models` prints `provider/model` one per line, exit 0.

## Architecture

Follows the existing registry pattern. New per-provider module under
`src/lib/providers/opencode/`; everything else is registry wiring + a UI picker.

### New files
- `src/lib/providers/opencode/paths.ts` - resolve data dir + DB path, honoring
  `OPENCODE_DATA_DIR` then `XDG_DATA_HOME` then `~/.local/share/opencode`. (Test override.)
- `src/lib/providers/opencode/db.ts` - read-only `node:sqlite` open helper + small query
  wrappers. Defensive: returns null / [] on any failure (DB absent, locked, schema drift).
- `src/lib/providers/opencode/history.ts` - `scanOpenCode(): ProviderSession[]`. Query
  `session` rows, map columns directly (real tokens/cost), count messages/tool-parts,
  mtime-cache keyed on `time_updated` like grok/codex. One `ProviderUsageRecord` per
  session built from the aggregate columns (key = session id).
- `src/lib/providers/opencode/tailer.ts` - `OpenCodeTailer` polls the DB ~2s for the live
  session row matching cwd (realpath-aware; `/tmp` vs `/private/tmp`) created >= startedAt,
  emits cost/tokens/model/current-tool/todos as `TailPatch`.
- `src/lib/providers/opencode/driver.ts` - `CliDriver`: `findCli` adds `~/.opencode/bin`
  fallback after `resolveCliPath`; `buildArgs` -> `-m <apiId||raw>`, `--prompt` (when not
  resuming), `--dangerously-skip-permissions`, `-s` resume; `promptDelivery:"arg"`; no
  effort; `mcpConfigArgs` `[]`.
- `src/lib/providers/opencode/models.ts` - `listOpenCodeModels()` spawns `opencode models`
  (spawnSync, TTL cache), parses `provider/model` lines, falls back to the static zen set
  on failure.
- `src/app/api/providers/opencode/models/route.ts` - `GET` returns the discovered list.
- `src/components/views/model-picker.tsx` - extracted picker. Segmented buttons for small
  static lists; a search-filtered combobox for opencode (async list from the API).

### Changed files
- `src/lib/shared/providers.ts` - add `"opencode"` to `PROVIDER_IDS` + a `ProviderMeta`
  (label "OpenCode", vendor "SST", binary `opencode`, home `.opencode`, accent, tagline).
- `src/lib/shared/models.ts` - add the stable `opencode/*` zen models (id === apiId so the
  id the UI sends IS the `-m` arg), default `opencode/north-mini-code-free`; add
  `modelBelongsToProvider(provider, modelId)` (static match OR opencode `a/b` pattern) for
  route validation; opencode dynamic models resolve in history via raw `provider/model`.
- `src/lib/providers/registry.ts` - import + DRIVERS entry.
- `src/app/api/sessions/route.ts` - relax `model` validation to accept opencode dynamic
  ids via `modelBelongsToProvider` (replaces strict `isModelId` + `providerOfModel` refine).
- `src/components/views/new-session.tsx` - use `ModelPicker`; mention OpenCode in the lede.
- `src/components/shell/provider-icons.tsx` - OpenCode glyph.

## Model picker behavior

- Static providers (claude/codex/gemini/grok): unchanged segmented buttons from the catalog.
- opencode: fetch `/api/providers/opencode/models` on select; render a search input + a
  scrollable filtered list of `provider/model` ids; selection sends the id verbatim. Default
  stays the static zen default until a pick is made.

## Cost / effort notes (scoped)

- Free zen models cost $0; pricing-estimate over usage records yields 0 (correct). Real
  cost passthrough from the DB `cost` column is noted as future work (no `cost` field on
  `ProviderSession` today).
- `--variant` reasoning-effort mapping is future work; opencode entries use `effortLevels=[]`.

## End-to-end test (two layers)

1. CI-safe vitest (`tests/integration/opencode-driver.test.ts`, no binary): seed a temp
   opencode-schema SQLite DB via `node:sqlite`, point `OPENCODE_DATA_DIR` at it, assert
   `scanOpenCode()` maps a row to the right `ProviderSession`; assert `buildArgs` argv for
   model/prompt/skip-perms/resume; assert `listOpenCodeModels` line parsing and
   `modelBelongsToProvider`.
2. Real proof (run once during the task, reported): spawn a real opencode session through
   the driver/PTY path, confirm it boots, the tailer reads the live DB row, and
   `scanOpenCode` picks it up. Headless `opencode run` is already proven (returned
   `OPENCODE_OK`, wrote a real `session` row).

## Out of scope

- Authing additional providers (`opencode auth login`); the user pilots default + plan models.
- `--variant` effort, real-cost passthrough, MCP-into-opencode wiring.
