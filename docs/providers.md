# Multi-provider CLIs

Cockpit pilots three agent CLIs side by side: **Gemini** (Google `gemini`),
**Claude** (Anthropic `claude`), and **Codex** (OpenAI `codex`). The active
provider is a topbar switch; sessions and metrics are counted strictly per
provider, never mixed.

## Concepts

- `ProviderId = "gemini" | "claude" | "codex"` lives in
  `src/lib/shared/providers.ts` (client-safe: label, vendor, binary name, home
  dir, accent). `DEFAULT_PROVIDER` is `claude`.
- The model registry (`src/lib/shared/models.ts`) is per-provider: each
  `ModelSpec` carries `provider`, and helpers (`modelsForProvider`,
  `defaultModelFor`, `providerOfModel`) scope lookups. Model ids stay globally
  unique so a single `ModelId` recovers its provider.
- `SpawnConfig` and `SessionSnapshot` carry `provider`. It is persisted
  (`session-store.ts`, `cron-types.ts`) and round-trips through the WS protocol.

## The driver contract

Server-side behaviour lives behind `CliDriver` (`src/lib/providers/types.ts`).
One driver per provider, resolved by `getDriver(provider)`
(`src/lib/providers/registry.ts`):

| Member | Responsibility |
| --- | --- |
| `findCli()` | absolute binary path or null (honours `<PROVIDER>_CLI_PATH`) |
| `buildArgs(cfg, effort)` | argv for the spawn |
| `promptDelivery` | `"type"` pastes the prompt into the TTY (Claude); `"arg"` embeds it in argv (Gemini/Codex) |
| `effortInArgs` / `effortSlash` | whether effort is a launch flag, and the runtime slash command (or null) to change it live |
| `createTailer(cwd, startedAt, onPatch)` | live metrics watcher emitting `TailPatch` |
| `scanSessions()` | historical sessions as `ProviderSession[]` for `/api/metrics` |

`PtyRunner` is fully provider-agnostic: it asks the driver for the cli path,
argv, env extras, prompt/effort delivery and tailer. `/api/metrics` calls
`scanAllProviders()` and tags every row with its provider; the client filters to
the active provider before aggregating.

## Per-provider specifics

### Claude (`~/.claude`)
Wraps the existing `claude-code/` code. `--model`, `--effort` (low..max as a
flag, `ultracode` via the `/effort` slash command), `--permission-mode` /
`--dangerously-skip-permissions`. Live + historical metrics from the JSONL under
`~/.claude/projects/`.

### Gemini (`~/.gemini`)
Driven interactively: `gemini -m <model> -i "<prompt>" [--approval-mode yolo |
--yolo]`. Gemini exposes **no** reasoning-effort CLI flag, so its models have no
effort ladder. Resume via `--resume <id>`.

History comes from `~/.gemini/tmp/<project_hash>/logs.json` (project_hash is a
SHA-256 of the project root path; the parser tolerates both a JSON array and the
newer JSONL form). **logs.json records carry no token counts and no cwd**, so:

- sessions and message counts are reported; cost/tokens are left at zero;
- sessions are keyed by the opaque `project_hash` dir.

Token usage is only emitted on Gemini's headless `--output-format json` stdout
(`stats.models.<id>.tokens`: `prompt`/`candidates`/`thoughts`/`cached`) or via
its OpenTelemetry export. To wire durable Gemini cost accounting later, enable
`--telemetry` and parse the OTLP output, or run headless and capture stdout.

### Codex (`~/.codex`, override `CODEX_HOME`)
Driven interactively: `codex -m <model> -c model_reasoning_effort=<low|medium|
high> --ask-for-approval <policy> --sandbox <mode>` (or
`--dangerously-bypass-approvals-and-sandbox` for skip-perms). Effort is a launch
config override and cannot change on a live session. Resume via
`codex resume <id>`.

History + live metrics parse the rollout JSONL at
`~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-*.jsonl`. Each line is
`{ timestamp, type, payload }`; token usage is the **last** `event_msg` of inner
type `token_count` (`info.total_token_usage` is cumulative, so we never sum).
`input_tokens` includes cached input, so billable input is
`input_tokens - cached_input_tokens`; `output_tokens + reasoning_output_tokens`
is billed as output.

## Pricing

`claude-code/pricing.ts` is provider-neutral. Fallback per-token prices for
Gemini and Codex models were added, plus substring matches; LiteLLM overrides
them when reachable.

## Adding a provider

1. Add a `ProviderMeta` to `PROVIDERS` and the `ProviderId` union.
2. Add its `ModelSpec`s (with `provider`) to `MODELS`.
3. Implement a `CliDriver` under `src/lib/providers/<id>/` and register it in
   `registry.ts`.
4. Add fallback pricing entries if the vendor is not in LiteLLM.

The topbar, store, dashboard, new-session form and metrics view need no changes:
they iterate `PROVIDERS` and scope by the active `provider`.

## Status of the Gemini/Codex drivers

`gemini` and `codex` were **not installed** in the build environment, so their
flags, paths and transcript formats are implemented from the vendors' published
docs and source (verified by research, high confidence for Codex, medium for
Gemini's exact model ids and the logs.json/JSONL migration state). They degrade
gracefully: a missing home dir yields an empty scan, and an absent binary yields
a clear "install / set `<PROVIDER>_CLI_PATH`" error at spawn. Verify the flags
against the installed build and adjust `buildArgs` if a vendor changed them.

## Local checks

`pnpm typecheck` is the reliable gate and passes. `pnpm test` and `pnpm build`
currently fail in this container for an unrelated reason: the shared
`node_modules` is missing the linux-arm64 native binaries for `rollup`
(vitest) and `lightningcss` (Tailwind v4 build). Reinstall dependencies on the
target arch to run those.
