# Cockpit MCP server

Cockpit exposes its own MCP server so that the Claude Code sessions it pilots can
talk to each other, report on the fleet, and drive the orchestrator (spawn, kill,
cron). The user can also open a session and ask it to "summarize everything" or
"create a daily cron", and the session answers by calling these tools.

This document covers the architecture, the transport choice, the tool catalog with
schemas, how each spawned session is wired up automatically, security, and identity.

## 1. Where the server lives

A piloted session is a real `claude` CLI process spawned through `node-pty`
(`src/lib/orchestrator/pty-runner.ts`). It is NOT the in-process Agent SDK
`query()` generator, so the SDK helper `createSdkMcpServer` is not reachable from
it. The session reaches MCP servers exactly the way any Claude Code CLI does:
through `--mcp-config` / `.mcp.json` (stdio, http or sse transports).

The cockpit tools need direct access to the live `SessionManager`, the cron store,
and an in-process message bus. Those all live in the process that owns the manager:

- `solo` role: the Next server (`server.ts`, default port 3010).
- `orchestrator` role: the orchestrator daemon (`server-orchestrator.ts`, port 4010).
- `app` role: the Next front-end has no manager; it proxies to the daemon.

A spawned session is a child of whichever process called `manager.spawn()`, so
`127.0.0.1:<that process port>` is always reachable from the child. We therefore
serve MCP from the manager-owning process and point each child at it over loopback
HTTP. The handler is transport-agnostic (the `dispatch` function in
`src/lib/mcp/protocol.ts`) and mounted twice:

```
solo          child claude ──http──> Next  :3010 /api/mcp-bridge ─┐
orchestrator  child claude ──http──> daemon:4010 /mcp ────────────┤
                                                                  ├─> dispatch()
                                                          getControl() (Local)
                                                          crons.ts store
                                                          message bus (singleton)
```

In `app` deployments only the daemon spawns PTYs, so children always hit the
daemon `/mcp`; the Next `/api/mcp-bridge` route still works for a solo box.

## 2. Transport: streamable HTTP, single JSON response

We use the MCP **streamable HTTP** transport rather than stdio.

- stdio would mean one extra bridge process per session (each child would spawn
  `node --experimental-transform-types stdio-server.ts`), plus that bridge would
  still have to reach the manager over HTTP. More moving parts, same network hop.
- HTTP keeps a single server, co-located with the manager, with zero per-session
  processes. Identity travels in a header.

The server is stateless: each `POST /mcp` carries one JSON-RPC 2.0 message (or a
batch array) and the server answers with a single `application/json` response
(an array of responses for a batch; no SSE stream is opened, because no tool
needs server-initiated push for the prototype). Notifications (no `id`) get
`202 Accepted`, and a batch made only of notifications does too. This is a valid subset of the streamable HTTP spec
and the Claude Code CLI accepts it.

Methods handled: `initialize`, `notifications/initialized`,
`notifications/cancelled`, `tools/list`, `tools/call`, `ping`. Everything else
returns JSON-RPC error `-32601`.

## 3. Identity and security

- **Session identity.** The per-session config embeds a header
  `x-cockpit-session: <sessionId>`. The server reads it to know which session is
  calling (used by `send_message`, `broadcast`, `read_messages`). A call with no
  / unknown session id can still read fleet state but cannot send messages as a
  peer.
- **Shared key.** At boot the manager-owning process mints a random
  `COCKPIT_MCP_KEY` (or reads it from env). Every request must carry
  `x-cockpit-mcp-key`. This stops other local processes from driving the
  orchestrator. The key and the per-session config are written to
  `~/.claude/cockpit/mcp/<sessionId>.json` (mode 600), so the secret never appears
  in `ps` output, unlike an inline `--mcp-config '{...}'` string.
- **Loopback only.** The endpoint binds to the existing server which listens on
  the compose-internal interface; it is never exposed publicly.
- **Blast radius.** `spawn_session` / `kill_session` / `create_cron` are real
  control-plane actions. For the prototype they are always enabled; a follow-up
  can gate them behind a per-session capability flag carried in the config file
  (for example a read-only session would get `"capabilities":["read"]`).

The Next `/api/mcp-bridge` route is additionally validated by the same key, and
the existing `/api/mcp/*` routes (which manage the user's own MCP server list) are
unrelated to this server.

## 4. Tool catalog

All inputs are validated with zod on the handler side; the advertised
`inputSchema` is hand-written JSON Schema (kept in sync, no zod-to-json-schema
dependency). Each tool returns a `content: [{type:"text", text}]` block whose text
is JSON, so a calling session can parse it.

| Tool | Input | Effect |
|------|-------|--------|
| `list_sessions` | none | All live session snapshots (compact). |
| `get_session` | `{ id }` | One full snapshot, or error if unknown. |
| `summarize_all` | `{ includeCrons?: boolean }` | Fleet rollup: per-session line, totals (cost, tokens, tool calls), state counts, pending message counts, optional cron summary. |
| `send_message` | `{ to, text }` | Queue a message to one session's inbox. `from` is the caller's session id. |
| `broadcast` | `{ text }` | Queue a message to every other live session. |
| `read_messages` | `{ peek?: boolean }` | Drain (or peek) the caller's inbox. |
| `spawn_session` | `{ project, cwd, name, model, prompt, allowedTools?, approvalMode?, branch?, effort?, dangerouslySkipPermissions? }` | Start a new piloted session, returns its id. |
| `kill_session` | `{ id }` | Terminate a session. |
| `create_cron` | `{ name, schedule, spawn{...}, description?, enabled? }` | Persist a cron job; `schedule` is `{kind:"recurring",expression}` or `{kind:"oneshot",at}`. |
| `list_crons` | none | All cron jobs with next-fire / last-run. |

### Schemas (selected)

`schedule` mirrors `CronSchedule` in `src/lib/shared/cron-types.ts`:

```jsonc
// recurring: standard 5-field cron, validated by cron-scheduler.validateCronExpression
{ "kind": "recurring", "expression": "0 9 * * 1-5" }
// oneshot: ISO timestamp in the future
{ "kind": "oneshot", "at": "2026-06-01T09:00:00.000Z" }
```

`spawn` (inside `create_cron`) and the `spawn_session` args share the shape of
`SpawnConfig` / `CronSpawnSpec`: `project`, `cwd`, `name`, `model` (one of the
ids in `models.ts`), `prompt`, plus optional `allowedTools`, `approvalMode`
(`auto|prompt|strict`), `branch`, `effort`, `dangerouslySkipPermissions`.

## 5. Inter-session messaging model

The prototype uses a **pull** model: messages land in an in-memory inbox
(`src/lib/mcp/bus.ts`, a process singleton keyed by `Symbol.for`) and the target
session retrieves them by calling `read_messages`. This is the natural fit for MCP
(tools are request/response) and never disrupts a session mid-turn.

A future **push** option could write a one-line notice into the target's PTY via
`manager.getPty(id).write(...)`, or surface unread counts on the tile through a new
snapshot field and a reducer action (see CLAUDE.md "Add a new tile state"). Push is
out of scope for the prototype because injecting into an interactive REPL is
intrusive and needs careful framing.

Inboxes are capped (most recent N per session) and dropped when a session is
`gone`.

## 6. How a spawned session is configured automatically

`PtyRunner` injects the MCP config at spawn time (`src/lib/mcp/config.ts`):

1. Compute the endpoint URL from the role: solo uses
   `http://127.0.0.1:${COCKPIT_PORT}/api/mcp-bridge`; orchestrator uses
   `http://127.0.0.1:${COCKPIT_ORCHESTRATOR_PORT}/mcp`.
2. Write `~/.claude/cockpit/mcp/<sessionId>.json` (mode 600):

   ```jsonc
   {
     "mcpServers": {
       "cockpit": {
         "type": "http",
         "url": "http://127.0.0.1:3010/api/mcp-bridge",
         "headers": {
           "x-cockpit-session": "s_ab12cd",
           "x-cockpit-mcp-key": "<random>"
         }
       }
     }
   }
   ```

3. Add `--mcp-config <path>` to the CLI argv (`buildArgs`). We do NOT pass
   `--strict-mcp-config`, so the session keeps its own user/project MCP servers
   (for example `datageo`) AND gains `cockpit`. The file is removed on exit.

Because the config is merged, a session sees the cockpit tools as
`mcp__cockpit__list_sessions`, `mcp__cockpit__summarize_all`, etc.

## 7. Files

```
src/lib/mcp/
  bus.ts            in-process message bus singleton (inbox per session)
  config.ts         endpoint URL + per-session .mcp.json writer + argv
  protocol.ts       JSON-RPC 2.0 + MCP method dispatch (dispatch fn)
  tools/index.ts    tool registry + dispatch to handlers
  tools/sessions.ts list_sessions, get_session, summarize_all, spawn/kill
  tools/messaging.ts send_message, broadcast, read_messages
  tools/crons.ts    create_cron, list_crons
src/app/api/mcp-bridge/route.ts   solo/app HTTP mount (Next route handler)
server-orchestrator.ts            adds POST /mcp mount for the daemon
src/lib/orchestrator/pty-runner.ts injects --mcp-config per session
```

## 8. Out of scope / next steps

- Push notifications into tiles or PTYs (see section 5).
- Per-session capability gating for the control-plane tools (section 3).
- SSE streaming for long-running tools (none today need it).
- `resources` and `prompts` MCP surfaces (only `tools` is implemented).
</invoke>
