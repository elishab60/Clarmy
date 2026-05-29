# Secrets management + daily digest cron

Date: 2026-05-29
Status: approved (design), pending implementation plan

## Goal

Two linked capabilities for Cockpit:

1. A secrets store so the user can register `.env` style keys (API keys, DB URLs, etc.) that get injected into the environment of cron spawned sessions, with per cron selection of which keys to inject.
2. A daily digest cron that, every day at 17:00, spawns an agentic Claude session which gathers everything done that day across all projects (sessions, tokens consumed, cost, and a concrete narrative of what was accomplished per project) and emails a complete synthetic summary in French.

The email channel is Resend, called server side. The agent never sees the Resend key.

## Decisions (locked)

- Report engine: agentic cron session (reuses the existing cron then spawn then MCP pattern).
- Email channel: Resend HTTP API, called via native `fetch` (no new npm dependency).
- Secret storage: encrypted at rest (AES 256 GCM).
- Injection scope: per cron selection of secret keys.
- Digest model: `opus-4.8`, effort `xhigh`.
- No activity days: still send a mail, with a playful roast ("faignon travaille pas les pieds").
- Schedule: `0 17 * * *` (system/container time; no timezone support yet).
- Recipient: `e.bajemon@tw3partners.com`. Sender: configurable, defaults to a verified domain address.
- Project scope: all projects under `~/.claude/projects` that had activity that day.

## Resend sender caveat

Resend's sandbox sender `onboarding@resend.dev` can only deliver to the Resend account owner email. Because the recipient is `e.bajemon@tw3partners.com`, the user must verify a domain in Resend and send FROM it (for example `reports@tw3partners.com`). FROM and TO are stored as secrets (`COCKPIT_REPORT_FROM`, `COCKPIT_REPORT_TO`) so they can be set once the domain is verified, without code changes.

## Architecture

```
cron fires (17:00)
  -> cron-scheduler.fire()
       -> resolve spawn.secretKeys via getSecrets()  (decrypt selected)
       -> manager.spawn(config with resolved config.env)
            -> pty-runner merges process.env + driver.envExtras + config.env
  -> agentic Claude session (opus-4.8, xhigh, approvalMode auto)
       -> calls get_daily_activity (deterministic per project numbers)
       -> reads a few transcripts for narrative color
       -> composes complete FR digest
       -> calls send_email
            -> email.sendEmail() reads RESEND_API_KEY/TO/FROM from secret store
            -> POST https://api.resend.com/emails (fetch)
  -> recipient inbox
```

## Components

### 1. Secret store: `src/lib/claude-code/secrets.ts`

Mirrors the existing `src/lib/claude-code/crons.ts` file based store pattern.

- File: `~/.claude/cockpit/secrets.json`, perms 0600, atomic write (tmp file then rename).
- Add `secretsFile()` and `secretKeyFile()` helpers to `src/lib/claude-code/paths.ts` (next to `cronsFile()`).
- On disk shape:
  ```
  { version: 1, secrets: { [key: string]: { ciphertext: string, iv: string, authTag: string, updatedAt: string } } }
  ```
- Encryption: AES 256 GCM. Master key resolution order:
  1. `COCKPIT_SECRET_KEY` env var (32 byte key, base64 or hex).
  2. Else read/generate `~/.claude/cockpit/secret.key` (random 32 bytes, perms 0600).
- Public API:
  - `setSecret(key, value)`: encrypt and persist; returns `{ key, updatedAt }`.
  - `getSecret(key): string | null`: decrypt one value; returns null on missing or decrypt failure (logged).
  - `deleteSecret(key)`: remove and persist.
  - `listSecretKeys(): { key, updatedAt }[]`: metadata only, NEVER returns plaintext.
  - `getSecrets(keys: string[]): Record<string, string>`: decrypt the selected subset for env injection; silently skips keys that fail to decrypt (logged).

### 2. Crypto helpers: `src/lib/util/crypto.ts`

- `encryptSecret(plaintext: string, key: Buffer): { ciphertext, iv, authTag }` using `createCipheriv('aes-256-gcm', key, iv)` with a random 12 byte iv.
- `decryptSecret({ ciphertext, iv, authTag }, key: Buffer): string`.
- `loadMasterKey(): Buffer` implementing the resolution order above.
- All values stored/transported as base64 strings.

### 3. Secrets MCP tools: `src/lib/mcp/tools/secrets.ts`

Follows the `ToolDef` pattern (zod validation + hand written JSON Schema + `handle(args, ctx)`), registered by spreading into `ALL_TOOLS` in `src/lib/mcp/tools/index.ts`.

- `set_secret { key, value }`: calls `setSecret`. Returns `{ key, updatedAt }`. Never echoes the value.
- `list_secrets {}`: calls `listSecretKeys`. Returns keys + updatedAt only.
- `delete_secret { key }`: calls `deleteSecret`.

### 4. Env injection (per cron selection)

- `src/lib/shared/cron-types.ts`: add `secretKeys?: string[]` to `CronSpawnSpec`.
- `src/lib/shared/types.ts`: add `env?: Record<string, string>` and `secretKeys?: string[]` to `SpawnConfig`.
- `src/lib/orchestrator/cron-scheduler.ts` `fire()` (around lines 184 to 216): before calling `manager.spawn()`, if `spawn.secretKeys?.length`, resolve `const env = getSecrets(spawn.secretKeys)` and pass it on the spawn config as `config.env`.
- `src/lib/orchestrator/pty-runner.ts` (env block around lines 82 to 89): change the merge to `{ ...process.env, ...driver.envExtras(config), ...(config.env ?? {}) }` so injected secrets win.
- `src/lib/orchestrator/session-store.ts` `PersistedSession`: persist only `secretKeys` (references), NEVER the resolved plaintext `env`. On `manager.restore()`, re-resolve via `getSecrets(secretKeys)` so restarted sessions still get fresh values.
- API zod schemas in `src/app/api/crons/route.ts` (SpawnSchema) and `src/app/api/sessions/route.ts` accept optional `secretKeys: string[]`. They do NOT accept raw `env` from the client (secrets only flow through the store).

Security property: plaintext secret values exist only in process memory at spawn time and in the encrypted file. They are never written to `sessions.json` or `crons.json`, never returned by list endpoints, and never exposed to the spawned agent except as the env vars it was granted.

### 5. Email sender: `src/lib/claude-code/email.ts`

- `sendEmail({ to?, from?, subject, html?, text }): Promise<{ id: string }>`.
- Reads `RESEND_API_KEY`, and defaults `to`/`from` from `COCKPIT_REPORT_TO` / `COCKPIT_REPORT_FROM` via `getSecret`.
- If `RESEND_API_KEY` is missing, throws a clear error instructing the user to `set_secret RESEND_API_KEY`.
- `POST https://api.resend.com/emails` with `Authorization: Bearer <key>` and JSON body `{ from, to, subject, html, text }` via native `fetch`. No npm dependency added.
- Non 2xx response: throw with the Resend error body included.

### 6. `send_email` MCP tool: `src/lib/mcp/tools/email.ts`

- Args: `{ to?, subject, html?, text, from? }`. Missing `to`/`from` fall back to the stored secrets inside `sendEmail`.
- Returns the Resend message id on success, or an actionable `errorResult` if the key is unset or Resend rejects.

### 7. Daily activity data: `src/lib/claude-code/daily-activity.ts` + `get_daily_activity` MCP tool

- `buildDailyActivity(date?: string): DailyActivity` reuses `src/lib/claude-code/history.ts` (`scanAll()` + `parseSession()`), filtering usage records by `CCUsageRecord.ts` to the target date (default today, ISO `YYYY-MM-DD`).
- Returns per project aggregation:
  ```
  {
    date: string,
    totals: { sessions, inputTokens, outputTokens, cost },
    projects: Array<{ project, cwd, sessions, inputTokens, outputTokens, cost, sessionIds }>
  }
  ```
- MCP tool `get_daily_activity { date? }` in a new `src/lib/mcp/tools/metrics.ts`, registered in `index.ts`. Gives the agent reliable numbers so it never has to do token math in prompt.

### 8. The digest cron (created last)

Created via the `create_cron` MCP tool once code is merged and verified:

- name: `daily-digest`
- schedule: `{ kind: 'recurring', expression: '0 17 * * *' }`
- spawn:
  - project label: `daily-digest`, cwd: the slave repo path (agent uses absolute paths for `~/.claude/projects`).
  - model: `opus-4.8`, effort: `xhigh`.
  - approvalMode: `auto` (unattended).
  - allowedTools: `[Read, Grep, Glob, Bash, mcp__cockpit__get_daily_activity, mcp__cockpit__send_email]`.
  - secretKeys: none required for the digest itself (the Resend key is read server side by `send_email`).
  - prompt (FR): instruct the agent to:
    1. Call `get_daily_activity` for today.
    2. For each project with activity, read a few of today's transcript files under `~/.claude/projects/<encoded-cwd>/` to describe concretely what was done.
    3. Compose a complete French digest: per project (what was accomplished, number of sessions, tokens in/out, estimated cost), plus daily totals.
    4. If there was no activity at all today, send the digest anyway with the roast line "faignon travaille pas les pieds".
    5. Call `send_email` with subject `Digest quotidien <date>` and an HTML body.

## Configuration / docs

- `.env.example`: document `COCKPIT_SECRET_KEY` (optional, else a keyfile is generated).
- Note in the spec that `RESEND_API_KEY`, `COCKPIT_REPORT_TO`, `COCKPIT_REPORT_FROM` are set through `set_secret`, not env.

## Error handling summary

- Missing `RESEND_API_KEY`: `send_email` returns an actionable error; no crash.
- Decrypt failure (rotated or missing master key): `getSecret`/`getSecrets` return null/skip and log; secrets degrade safely rather than throwing in the spawn path.
- Resend non 2xx: tool returns the error text; the cron run is still recorded as `spawned` and the agent reports the failure in its session.
- No activity today: email still sent with the roast line.

## Testing (vitest integration, `tests/integration/`)

- secrets: encrypt then decrypt roundtrip; `listSecretKeys` never leaks values; wrong/missing master key yields null without throwing.
- injection: `fire()` places resolved env on the spawn config; persisted session store contains `secretKeys` references but no plaintext values.
- email: mock `fetch`, assert the Resend payload shape and `Authorization` header; missing key yields an error.
- daily-activity: fixture JSONL transcripts produce correct per project aggregation and correct date filtering.
- MCP: the new tools (`set_secret`, `list_secrets`, `delete_secret`, `send_email`, `get_daily_activity`) are registered and dispatch correctly.

## Out of scope (YAGNI)

Secret rotation UI, multi recipient lists, Resend retry/backoff, cron timezone support, persistent email send log, a settings UI for secrets (MCP + API only for now).

## Affected files

New:
- `src/lib/claude-code/secrets.ts`
- `src/lib/util/crypto.ts`
- `src/lib/claude-code/email.ts`
- `src/lib/claude-code/daily-activity.ts`
- `src/lib/mcp/tools/secrets.ts`
- `src/lib/mcp/tools/email.ts`
- `src/lib/mcp/tools/metrics.ts`
- tests under `tests/integration/`

Modified:
- `src/lib/claude-code/paths.ts` (secretsFile, secretKeyFile)
- `src/lib/shared/cron-types.ts` (secretKeys on CronSpawnSpec)
- `src/lib/shared/types.ts` (env, secretKeys on SpawnConfig)
- `src/lib/orchestrator/cron-scheduler.ts` (resolve secrets in fire())
- `src/lib/orchestrator/pty-runner.ts` (env merge)
- `src/lib/orchestrator/session-store.ts` (persist secretKeys only, re-resolve on restore)
- `src/lib/mcp/tools/index.ts` (register new tools)
- `src/app/api/crons/route.ts` and `src/app/api/sessions/route.ts` (accept secretKeys)
- `.env.example` (document COCKPIT_SECRET_KEY)
