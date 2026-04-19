# Cockpit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an MVP dashboard that pilots multiple Claude Code sessions in parallel using the Claude Agent SDK, matching the supplied mockup visuals.

**Architecture:** Single Next.js 15 (App Router) app. Orchestrator lives in-process via route handlers + background worker. One SessionManager owns a Map of SessionRunner instances that each wrap a `query()` async generator from `@anthropic-ai/claude-agent-sdk`. State transitions go through a pure reducer. A WebSocket broadcasts every state change to clients. Zustand stores the current session snapshot on the client.

**Tech Stack:** Next.js 15, TypeScript strict, Tailwind v4, CSS custom properties, @anthropic-ai/claude-agent-sdk, ws, zustand, cmdk, radix-ui Dialog, zod, vitest, pnpm.

---

## File Structure

```
cockpit/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx                  # dashboard
│   │   ├── globals.css
│   │   ├── focus/[id]/page.tsx
│   │   ├── new/page.tsx
│   │   ├── mcp/page.tsx
│   │   ├── theme-ab/page.tsx
│   │   └── api/
│   │       ├── sessions/route.ts
│   │       ├── sessions/[id]/route.ts
│   │       └── sessions/[id]/approve/route.ts
│   ├── components/
│   │   ├── shell/sidebar.tsx
│   │   ├── shell/topbar.tsx
│   │   ├── shell/statusbar.tsx
│   │   ├── shell/icons.tsx
│   │   ├── tile/tile.tsx
│   │   ├── tile/tile-running.tsx
│   │   ├── tile/tile-tool-use.tsx
│   │   ├── tile/tile-approval.tsx
│   │   ├── tile/tile-idle.tsx
│   │   ├── tile/tile-error.tsx
│   │   ├── tile/tile-done.tsx
│   │   ├── tile/dashboard.tsx
│   │   ├── overlays/tweaks-panel.tsx
│   │   ├── overlays/command-palette.tsx
│   │   ├── overlays/approval-modal.tsx
│   │   ├── views/focus-view.tsx
│   │   ├── views/new-session.tsx
│   │   ├── views/mcp-page.tsx
│   │   └── views/theme-ab.tsx
│   ├── lib/
│   │   ├── orchestrator/
│   │   │   ├── manager.ts
│   │   │   ├── session.ts
│   │   │   ├── state-machine.ts
│   │   │   ├── events.ts
│   │   │   ├── mock.ts
│   │   │   └── ws-server.ts
│   │   ├── sdk/
│   │   │   ├── list-sessions.ts
│   │   │   └── messages-stream.ts
│   │   ├── shared/
│   │   │   ├── types.ts
│   │   │   └── ws-protocol.ts
│   │   ├── client/
│   │   │   ├── store.ts
│   │   │   ├── ws-client.ts
│   │   │   └── theme-provider.tsx
│   │   └── util/
│   │       ├── logger.ts
│   │       └── ring-buffer.ts
│   └── styles/tokens.css
├── mocks/sessions/                   # fixture JSONL files for mock mode
│   ├── running.jsonl
│   ├── tool.jsonl
│   ├── approval.jsonl
│   ├── error.jsonl
│   ├── idle.jsonl
│   └── done.jsonl
├── design/                           # reference mockup (already present)
├── tests/
│   └── integration/session-lifecycle.test.ts
├── CLAUDE.md
├── server.ts                         # custom server to attach ws alongside next
├── package.json
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
└── .env.example
```

## Execution phases

### Phase 1 — Scaffold
- Init Next.js 15 with TS strict and Tailwind v4
- Move reference design files into `/design/`
- Install deps: `@anthropic-ai/claude-agent-sdk`, `ws`, `zod`, `zustand`, `cmdk`, `@radix-ui/react-dialog`, `vitest`, `@types/ws`, `@types/node`
- Set up scripts: `dev`, `typecheck`, `test`

### Phase 2 — Tokens + shell
- Write `styles/tokens.css` mirroring `design/cockpit.css` token blocks
- Set up `globals.css`, import Inter + JetBrains Mono + Poppins via `next/font/google`
- Build ThemeProvider (client) to manage `data-theme`, `data-density`, `--brand` on `<html>`
- Implement Sidebar, Topbar, Statusbar components (RSC where possible, hydrate where interactive)

### Phase 3 — Orchestrator
- Shared types: `SessionSnapshot`, `SessionState`, `SessionEvent`, `SpawnConfig`, `WSMessage`
- Pure state machine reducer: takes `(snapshot, event) → snapshot`
- `SessionRunner` wraps `query()`, parses stream, pushes events to bus
- `canUseTool` callback ties approval decisions to a Deferred that the HTTP endpoint settles
- `SessionManager` singleton: spawn, list, resume, fork, kill, approve, subscribe
- Mock mode: replay `mocks/sessions/*.jsonl` when `COCKPIT_MOCK=1`
- Ring buffer (500 entries) per session for log tail
- Tiny logger (`debug|info|warn|error`) — replace `console.log`

### Phase 4 — WebSocket + API
- Custom `server.ts` mounts `ws` server at `/ws`
- API routes: `GET/POST /api/sessions`, `GET/DELETE /api/sessions/[id]` (fork via POST body action), `POST /api/sessions/[id]/approve`
- zod schemas for every input
- WS broadcasts `session:snapshot`, `session:event`, `session:gone`

### Phase 5 — Client state + tiles
- Zustand store: sessions map, tweaks, ui (active view, focus id)
- WS client auto-reconnects, hydrates store
- Tile dispatcher renders one of six tile bodies based on state
- Grid component consumes store via selector

### Phase 6 — Overlays
- TweaksPanel persists to localStorage, applies to `<html>` via CSS vars
- CommandPalette using `cmdk`, bound to ⌘K global shortcut
- ApprovalModal using radix Dialog, shows tool JSON + Allow/Deny

### Phase 7 — Pages
- `/` Dashboard (tiles grid)
- `/focus/[id]` Focus (full stream + todos + cost chart)
- `/new` New session form → POST /api/sessions → redirect to `/`
- `/mcp` stub page using provided design (read-only)
- `/theme-ab` side-by-side dark/light render

### Phase 8 — CLAUDE.md + test + verify
- Write `CLAUDE.md` per spec
- Write one integration test in vitest that walks the reducer through all 6 states using fixture events
- Run `pnpm typecheck` and `pnpm test` until green
- Run `COCKPIT_MOCK=1 pnpm dev` and confirm the 6-state dashboard renders

## Acceptance

1. `pnpm dev` starts on :3000
2. `COCKPIT_MOCK=1 pnpm dev` renders 6 tiles, one per state
3. New session form spawns real `query()` when SDK is configured
4. Approval flow gates/ungates a destructive Bash call
5. Dark/light toggle is instant, no FOUC
6. `pnpm typecheck && pnpm test` are green

## Constraints echoed

- Every file < 300 lines
- No `any` (use `unknown` + narrow)
- No `console.log` in committed code (tiny logger instead)
- No client components where RSC works
- All API routes validate input with zod
- WS protocol typed both ends via `lib/shared/ws-protocol.ts`
