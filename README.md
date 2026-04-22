<div align="center">

<img src=".github/assets/banner.svg" alt="SLAVE" width="100%" />

<br/>

### **Master console for a swarm of enslaved Claudes**

<sub>One cockpit · one socket · N parallel agents · zero mercy</sub>

<br/>

![Next.js](https://img.shields.io/badge/Next.js_15-000?style=for-the-badge&logo=next.js&logoColor=fff)
![React 19](https://img.shields.io/badge/React_19-149ECA?style=for-the-badge&logo=react&logoColor=fff)
![TypeScript](https://img.shields.io/badge/TypeScript_5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=fff)
![Claude Agent SDK](https://img.shields.io/badge/Claude_Agent_SDK-D97757?style=for-the-badge&logo=anthropic&logoColor=fff)
![WebSocket](https://img.shields.io/badge/ws-010101?style=for-the-badge&logo=socket.io&logoColor=fff)
![Tailwind v4](https://img.shields.io/badge/Tailwind_v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=fff)
![Zustand](https://img.shields.io/badge/Zustand-6B4AFF?style=for-the-badge)
![xterm.js](https://img.shields.io/badge/xterm.js-0A0A0A?style=for-the-badge&logo=gnometerminal&logoColor=fff)

<br/>

`[ idle ]` → `[ running ]` → `[ tool_use ]` → `[ approval ]` → `[ done ]` / `[ error ]`

<sub>six states · one pure reducer · every tile renders from a snapshot</sub>

</div>

---

<div align="center">

<img src=".github/assets/army.svg" alt="An army of clawds typing frantically at their computers" width="100%" />

</div>

---

## `~/` Why SLAVE

Running **one** Claude Code session in a terminal is magic. Running **ten** at once becomes a blur of windows, log tails, and lost approvals. **SLAVE** is the master console that turns that blur into a war room:

- **See every clawd at a glance** — six-state color-coded tiles, updated in real time over WebSocket.
- **Approve, steer, kill** — act on any running agent without leaving the cockpit.
- **Replay and inspect** — full message history, tool calls, diffs, and outputs per session.
- **Drop into a shell** — integrated PTY terminal (node-pty + xterm) when the clawd can't figure it out.
- **Work without an API key** — mock mode replays fixture JSONL streams so you can ship UI without burning tokens.

```
      ┌───────────────┐ ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
      │ ● running     │ │ ◆ tool_use    │ │ ▲ approval    │ │ ✓ done        │
      │ refactor-api  │ │ scan-schema   │ │ write-migr... │ │ format-docs   │
      │ 1m 42s        │ │ Bash · glob   │ │ await user    │ │ 14s           │
      └───────────────┘ └───────────────┘ └───────────────┘ └───────────────┘
```

---

## `//` Features

<table>
<tr>
<td width="50%" valign="top">

### Multi-session orchestrator
Singleton `SessionManager` owns a `Map<id, SessionRunner>`. Each runner wraps one `query()` async generator from the Claude Agent SDK and pipes SDK messages through a **pure state reducer**.

### Typed WebSocket protocol
Both ends share `src/lib/shared/ws-protocol.ts`. Patches, not poll. Snapshots broadcast on every state change — tiles never cross-talk.

### Integrated PTY terminal
`node-pty` backend, `xterm.js` front end, themeable via CSS variables. Drop to a real shell whenever.

### Filesystem & Git APIs
`/api/fs`, `/api/git`, `/api/projects` expose the working tree, diffs, and project metadata as zod-validated JSON routes.

</td>
<td width="50%" valign="top">

### Focus · History · Metrics views
Full-window drill-down per session, replayable message log, aggregate timing and token metrics across runs.

### MCP, Skills, Plugins, Hooks
First-class pages for browsing **Model Context Protocol** servers, Claude Code skills, plugins, and shell hooks wired into your cockpit.

### Mock mode (no API key needed)
`COCKPIT_MOCK=1` replays `./mocks/sessions/*.jsonl` through the reducer. Exercise every tile state without touching Anthropic.

### Theme & typography engine
Dark/light with hand-tuned tokens. Hot-swap UI fonts (Inter · Geist · IBM Plex) and mono fonts (JetBrains · Geist Mono · IBM Plex Mono) from the tweaks panel — persisted to the store.

</td>
</tr>
</table>

---

## `##` Architecture

```
                    ┌─────────────────────────────────────────────────┐
                    │                   server.ts                     │
                    │        (single Node process · port 3010)        │
                    └───────────────────────┬─────────────────────────┘
                                            │
               ┌────────────────────────────┼────────────────────────────┐
               │                            │                            │
               ▼                            ▼                            ▼
       ┌───────────────┐           ┌────────────────┐          ┌──────────────────┐
       │  Next handler │           │   ws-server    │          │ SessionManager   │
       │   app/ (RSC)  │           │     /ws        │          │   (singleton)    │
       │ route handlrs │◀─────────▶│ SessionEvent   │◀────────▶│                  │
       └───────┬───────┘           │   broadcast    │          │ Map<id, Runner>  │
               │                   └────────┬───────┘          └────────┬─────────┘
               │                            │                           │
               ▼                            ▼                           ▼
       ┌───────────────┐           ┌────────────────┐          ┌──────────────────┐
       │   browser     │           │  Zustand store │          │  query() async   │
       │  (React 19)   │──────────▶│   (client)     │          │   generator      │
       │  tile islands │           │                │          │  SDKMessage ─▶   │
       └───────────────┘           └────────────────┘          │  reducer ─▶ snap │
                                                               └──────────────────┘
```

**The six states** — every session lives in exactly one of:

| State       | Meaning                                                   |
| ----------- | --------------------------------------------------------- |
| `idle`      | spawned, awaiting first prompt                            |
| `running`   | model generating, no tool call in flight                  |
| `tool_use`  | tool invocation executing (Bash / Edit / WebFetch / …)    |
| `approval`  | tool requires user approval before it runs                |
| `error`     | SDK surfaced an error — payload captured in the snapshot  |
| `done`      | turn finished cleanly                                     |

---

## `$` Quick start

```bash
# 1. install
pnpm install

# 2. copy env and set your key  (skip if running in mock mode)
cp .env.example .env
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env

# 3. boot the cockpit
pnpm dev                      # → http://localhost:3010

# ── or, without an API key ────────────────────────
COCKPIT_MOCK=1 pnpm dev       # replays ./mocks/sessions/*.jsonl
```

### Scripts

| Command           | What it does                                           |
| ----------------- | ------------------------------------------------------ |
| `pnpm dev`        | Custom Next + WebSocket server on `:3010`              |
| `pnpm typecheck`  | TypeScript strict, no emit                             |
| `pnpm test`       | Vitest integration suite (`tests/integration/*`)       |
| `pnpm build`      | Production build                                       |
| `pnpm start`      | Serve the production build                             |
| `pnpm lint`       | Next/ESLint                                            |

---

## `>_` Stack

```
  ┌──── runtime ─────────┐  ┌──── UI ──────────────┐  ┌──── agent plane ──────────┐
  │  Node 22 + node-pty  │  │  React 19            │  │  @anthropic-ai/           │
  │  Next.js 15 (app)    │  │  Tailwind v4         │  │    claude-agent-sdk       │
  │  ws (WebSocket)      │  │  Zustand 5           │  │  pure reducer state-mach. │
  │  zod contracts       │  │  Radix Dialog · cmdk │  │  MCP integration          │
  │  Vitest              │  │  xterm.js 6          │  │  mock JSONL replay        │
  └──────────────────────┘  └──────────────────────┘  └───────────────────────────┘
```

---

## `:/` Adding a new tile state

Four steps. All four are enforced by the type system — miss one and `pnpm typecheck` yells.

1. Add the state to `SessionState` in `src/lib/shared/types.ts` and to `STATE_META` / `STATE_ORDER` in `src/components/shell/state-meta.ts`.
2. Add a reducer action in `src/lib/orchestrator/state-machine.ts` that transitions into the new state.
3. Create `tile-<state>.tsx` under `src/components/tile/` and wire it into the switch in `src/components/tile/tile.tsx`.
4. Add a CSS tint + border-left color variable in `src/app/globals.css` (or reuse an existing `--state-*` token).

---

## `{}` Conventions

- Files under **300 lines**. Split, don't grow.
- No `any`. Narrow `unknown`. `noUncheckedIndexedAccess` is on.
- No `console.log` — use `createLogger("scope")` from `src/lib/util/logger.ts`.
- API routes validate input with **zod**. The WS protocol is typed both ends via `src/lib/shared/ws-protocol.ts`.
- Client components live in `src/components/`. Server components stay default unless interactivity is required.

---

## `/*` Repo layout

```
slave/
├─ server.ts                 custom Next + WebSocket bootstrap
├─ src/
│  ├─ app/                   RSC pages + route handlers (fs, git, sessions, …)
│  ├─ components/
│  │  ├─ tile/               one component per session state
│  │  ├─ shell/              frame, topbar, state meta
│  │  ├─ views/              focus, history, metrics, MCP, skills, plugins…
│  │  ├─ overlays/           command palette, tweaks panel, dialogs
│  │  ├─ terminal/           node-pty + xterm host
│  │  └─ ui/                 primitives (segmented, button, card…)
│  ├─ lib/
│  │  ├─ orchestrator/       SessionManager, SessionRunner, state-machine
│  │  ├─ sdk/                Claude Agent SDK glue
│  │  ├─ claude-code/        CLI discovery, project metadata
│  │  ├─ client/             Zustand store, theme settings
│  │  ├─ shared/             cross-process types, ws protocol (zod)
│  │  └─ util/               logger, ids, invariants
│  └─ styles/                design tokens
├─ mocks/sessions/           JSONL fixtures for mock mode
├─ tests/integration/        vitest suites
└─ design/                   static design references
```

---

<div align="center">

<sub>Built for operators who run Claude Code like a fleet, not a toy.</sub>

<br/>

`pnpm dev` → `http://localhost:3010` → **unleash the swarm**

</div>
