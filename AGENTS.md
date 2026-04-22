# Cockpit

Cockpit is a Next.js 15 dashboard that pilots multiple Codex sessions in parallel via `@anthropic-ai/Codex-agent-sdk`. The whole app — UI + orchestrator + websocket — runs inside a single Next process booted by the custom `server.ts`. A singleton `SessionManager` owns a `Map<id, SessionRunner>`. Each runner wraps one `query()` async generator from the SDK and pipes its messages through a pure state reducer. Every state change is broadcast over `/ws` to connected clients, which hold the world in a Zustand store.

The client is kept deliberately thin: server components render shell + pages, and a handful of `"use client"` islands (tiles, overlays, views) subscribe to the store. All cross-process types live in `src/lib/shared/` so the WS protocol and event shapes are checked at both ends.

## Session state lives in `src/lib/orchestrator/state-machine.ts`

The pure reducer `reduce(snapshot, action)` is the single source of truth for a session's state. Runners translate SDK messages into `StateAction`s and apply them; the resulting snapshot is broadcast as a WS patch. Tile components render strictly from snapshots — no cross-talk.

The six valid states are `idle | running | tool_use | approval | error | done`.

## Add a new tile state (four steps)

1. Add the state to `SessionState` in `src/lib/shared/types.ts` and to `STATE_META`/`STATE_ORDER` in `src/components/shell/state-meta.ts`.
2. Add a reducer action in `src/lib/orchestrator/state-machine.ts` that transitions into the new state, plus any snapshot fields it needs.
3. Create a `tile-<state>.tsx` component under `src/components/tile/` and wire it into the switch inside `src/components/tile/tile.tsx`.
4. Add CSS tint + border-left color variable in `src/app/globals.css` (or reuse an existing `--state-*` token).

## Running locally without an Anthropic API key

`COCKPIT_MOCK=1 pnpm dev` makes the manager spawn `MockSessionRunner` instances instead of touching the SDK. The manager reads `./mocks/sessions/{running,tool,approval,error,idle,done}.jsonl` at boot and plays them into the reducer. Each fixture is a line-delimited JSON script of `{kind, payload, ms?}` envelopes where `kind` matches a `StateAction.type`. Use a `{"kind":"delay","ms":600}` line to pace playback.

Real mode: leave `COCKPIT_MOCK=0` (the default). The SDK reads `ANTHROPIC_API_KEY` from the environment. The orchestrator never writes to disk.

## Commands

- `pnpm dev` — start the custom Next + WebSocket server on :3010 (or `COCKPIT_PORT`)
- `pnpm typecheck` — TypeScript strict, no emit
- `pnpm test` — vitest integration suite (`tests/integration/*`)
- `pnpm build && pnpm start` — production build and serve

## Architecture map

```
server.ts ─┐
           ├─ next-handler ─ app/ (RSC + route handlers)
           ├─ ws-server ─── /ws ─ SessionEvent broadcast
           └─ SessionManager (singleton)
                └─ Map<id, SessionRunner | MockSessionRunner>
                       └─ query() AsyncGenerator
                             ↓ SDKMessage
                             └─ reducer → SessionSnapshot → bus
```

## Conventions

- Files are kept under 300 lines; split rather than grow.
- No `any`. Use `unknown` + narrow. `noUncheckedIndexedAccess` is on.
- No `console.log`. Use `createLogger("scope")` from `src/lib/util/logger.ts`.
- API routes validate input with zod. The WS protocol is typed both ends via `src/lib/shared/ws-protocol.ts`.
- Client components live in `src/components/`. Server components stay default unless a component needs interactivity.
