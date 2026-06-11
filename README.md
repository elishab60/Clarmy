<div align="center">

<img src=".github/assets/banner.svg" alt="CLARMY" width="100%" />

<br/>

### **Master console for an army of clawds**

<sub>one cockpit · one socket · three vendors · N parallel agents · zero friction</sub>

<br/>

![Next.js](https://img.shields.io/badge/Next.js_15-000?style=for-the-badge&logo=next.js&logoColor=fff)
![React 19](https://img.shields.io/badge/React_19-149ECA?style=for-the-badge&logo=react&logoColor=fff)
![TypeScript](https://img.shields.io/badge/TypeScript_5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=fff)
![Claude Agent SDK](https://img.shields.io/badge/Claude_Agent_SDK-D97757?style=for-the-badge&logo=anthropic&logoColor=fff)
![Codex CLI](https://img.shields.io/badge/Codex_CLI-10A37F?style=for-the-badge&logo=openai&logoColor=fff)
![Gemini CLI](https://img.shields.io/badge/Gemini_CLI-4285F4?style=for-the-badge&logo=googlegemini&logoColor=fff)
![WebSocket](https://img.shields.io/badge/ws-010101?style=for-the-badge&logo=socket.io&logoColor=fff)
![xterm.js](https://img.shields.io/badge/xterm.js-0A0A0A?style=for-the-badge&logo=gnometerminal&logoColor=fff)

<br/>

`[ idle ]` → `[ running ]` → `[ tool_use ]` → `[ approval ]` → `[ done ]` / `[ error ]`

<sub>six states · one pure reducer · every tile renders from a snapshot · nothing else is trusted</sub>

</div>

---

<div align="center">

<img src=".github/assets/army.svg" alt="An army of clawds typing frantically at their computers" width="100%" />

</div>

---

## `~/` Why CLARMY

Running **one** coding agent in a terminal is magic. Running **ten** at once, across **three vendors**, becomes a blur of windows, log tails, lost approvals and invisible spend. **CLARMY** turns that blur into a war room:

- **One grid, every agent** : six-state color-coded tiles, patched in real time over a single WebSocket.
- **Three vendors, one cockpit** : pilot **Claude Code**, **OpenAI Codex** and **Gemini CLI** side by side. Topbar switch, strictly separated metrics, per-vendor model registry.
- **Approve, steer, kill** : act on any running agent without leaving the cockpit. Change reasoning effort mid-run.
- **Telemetry that tells the truth** : live cost includes **subagents** (Task and Workflow transcripts are tailed too), context-window occupancy renders as an animated ASCII meter, vendor rate-limit windows show as quota gauges.
- **The fleet is self-aware** : CLARMY ships its **own MCP server**. Any piloted session can query the fleet, spawn or kill siblings, schedule crons, and report on everything.
- **Drop into a shell** : integrated PTY terminal (node-pty + xterm) when the clawd cannot figure it out.
- **Work without an API key** : mock mode replays fixture JSONL streams so you can ship UI without burning a token.

```
   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
   │ ● running       │ │ ◆ tool_use      │ │ ▲ approval      │ │ ✓ done          │
   │ refactor-api    │ │ scan-schema     │ │ write-migr…     │ │ format-docs     │
   │ claude · 1m 42s │ │ codex · Bash    │ │ claude · await  │ │ gemini · 14s    │
   └─────────────────┘ └─────────────────┘ └─────────────────┘ └─────────────────┘
```

---

## `%` Live telemetry

Numbers you can act on, rendered like a terminal would.

```
 CONTEXT                                    QUOTAS
 129.8k / 1.0M tok                  13.0%   Claude            MAX 20X        41%
 [███▍░░░░░░░░░░░░░░░░░░░░░░]               5H      [████▊░░░░░░]            44%
                                            WEEKLY  [███▍░░░░░░░]            31%
 COST                                       OPUS    [██████▎░░░░]            57%
 so far                $316.58              Codex             PLUS           17%
 tools used            7,382                5H      [█▉░░░░░░░░░]             7%
                                            WEEKLY  [██▊░░░░░░░░]            17%
```

- **Context meter** : occupancy of the current request prompt (main thread), denominator from the model registry or, for Codex, the live `model_context_window` reported by the CLI itself. Sub-cell eighth-block edge, accent-tinted track, shimmer sweep. No blinking.
- **Honest cost** : the live tailer ingests the nested `subagents/**/*.jsonl` transcripts (per-file offsets, `msg:req` dedup, per-record pricing by each message's own model). A session that fans out 10 readers shows what those readers actually burned.
- **Quota gauges** : Claude windows come from the same OAuth usage endpoint the CLI reads (5h / weekly / per-model), Codex from its rolling rate-limit events. Cached, backoff-aware, never fabricated.
- **Metrics that survive restarts** : the historical scanner walks every transcript on disk, **including subagent trees**, dedups replayed turns, prices per record, and folds children into their parent session.

---

## `//` Features

<table>
<tr>
<td width="50%" valign="top">

### Multi-provider orchestrator
A singleton `SessionManager` owns a `Map<id, Runner>`. SDK sessions wrap one `query()` async generator; CLI sessions run in a real PTY with a per-vendor driver (`buildArgs`, effort flags, transcript tailer). One `CliDriver` contract, three implementations.

### Pure state machine
Every SDK message and tail patch becomes a `StateAction` fed to `reduce(snapshot, action)`: the single source of truth. Tiles render strictly from snapshots. No cross-talk, no hidden state.

### Typed WebSocket protocol
Both ends share `src/lib/shared/ws-protocol.ts`. Patches, not polls. Snapshots broadcast on every state change.

### Fleet-level MCP server
Sessions piloted by CLARMY can call back into the cockpit: list the fleet, read any sibling's snapshot, spawn / kill sessions, manage cron jobs, pull aggregated usage. Ask one agent to "summarize everything the others did today" and it can.

### Cron scheduler
Recurring agent runs with model, effort and approval policy per job. Managed from the UI or via MCP.

</td>
<td width="50%" valign="top">

### Focus · History · Metrics
Full-window drill-down per session (live context meter, cost, todos, diffs), replayable history across vendors, and a metrics suite: multi-area chart overlaying cost / output / sessions, activity heatmap, per-project and per-model breakdowns.

### Quota cockpit
Sidebar gauges for every vendor's real rate-limit windows, rendered as ASCII bars in the user's accent color. Plan tier detected automatically.

### MCP · Skills · Plugins · Hooks
First-class pages for browsing Model Context Protocol servers, Claude Code skills, plugins and shell hooks wired into your machine.

### Integrated PTY terminal
`node-pty` backend, `xterm.js` front end, themed from the same accent tokens as the UI. Type into the actual CLI any time.

### Mock mode (no API key)
`COCKPIT_MOCK=1` replays `./mocks/sessions/*.jsonl` through the reducer. Exercise every tile state without touching a vendor.

### Theme engine
Dark / light with hand-tuned tokens, hot-swappable UI and mono fonts, one accent color driving the whole cockpit (bars, terminal cursor, CTA) with automatic contrast enforcement.

</td>
</tr>
</table>

---

## `##` Architecture

```
                     ┌──────────────────────────────────────────────────┐
                     │                    server.ts                     │
                     │         (single Node process · port 3010)        │
                     └────────────────────────┬─────────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              │                               │                               │
              ▼                               ▼                               ▼
      ┌───────────────┐              ┌────────────────┐             ┌───────────────────┐
      │  Next handler │              │   ws-server    │             │  SessionManager   │
      │   app/ (RSC)  │◀────────────▶│      /ws       │◀───────────▶│    (singleton)    │
      │ route handlers│              │  SessionEvent  │             │  Map<id, Runner>  │
      └───────┬───────┘              │   broadcast    │             └─────────┬─────────┘
              │                      └────────┬───────┘                       │
              ▼                               ▼                 ┌─────────────┴─────────────┐
      ┌───────────────┐              ┌────────────────┐         ▼                           ▼
      │    browser    │              │  Zustand store │  ┌─────────────┐            ┌──────────────┐
      │   (React 19)  │─────────────▶│    (client)    │  │ SDK runner  │            │  PTY runner  │
      │  tile islands │              └────────────────┘  │  query() ─▶ │            │ claude/codex │
      └───────────────┘                                  │  reducer ─▶ │            │ /gemini CLI  │
                                                         │  snapshot   │            │ + transcript │
                                                         └─────────────┘            │    tailers   │
                                                                                    └──────────────┘
```

**The six states** : every session lives in exactly one of:

| State       | Meaning                                                   |
| ----------- | --------------------------------------------------------- |
| `idle`      | spawned, awaiting first prompt                            |
| `running`   | model generating, no tool call in flight                  |
| `tool_use`  | tool invocation executing (Bash / Edit / WebFetch / …)    |
| `approval`  | tool requires user approval before it runs                |
| `error`     | error surfaced, payload captured in the snapshot          |
| `done`      | turn finished cleanly                                     |

**The vendor plane** : one driver contract, three implementations.

| Vendor | Binary   | Live metrics source                              | Models registry                      |
| ------ | -------- | ------------------------------------------------ | ------------------------------------ |
| Claude | `claude` | JSONL transcripts + nested `subagents/**` trees  | Mythos · Opus 4.8 · Sonnet · Haiku   |
| Codex  | `codex`  | rollout `token_count` events (window + usage)    | GPT-5.5 → GPT-5.2 ladder             |
| Gemini | `gemini` | `logs.json` (no token telemetry upstream)        | Gemini 3 / 2.5 family                |

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
  │  ws (WebSocket)      │  │  Zustand 5           │  │  codex + gemini drivers   │
  │  zod contracts       │  │  Radix Dialog · cmdk │  │  pure reducer state-mach. │
  │  Vitest              │  │  xterm.js 6          │  │  fleet MCP server         │
  └──────────────────────┘  └──────────────────────┘  └───────────────────────────┘
```

---

## `:/` Adding a new tile state

Four steps. All four are enforced by the type system: miss one and `pnpm typecheck` yells.

1. Add the state to `SessionState` in `src/lib/shared/types.ts` and to `STATE_META` / `STATE_ORDER` in `src/components/shell/state-meta.ts`.
2. Add a reducer action in `src/lib/orchestrator/state-machine.ts` that transitions into the new state.
3. Create `tile-<state>.tsx` under `src/components/tile/` and wire it into the switch in `src/components/tile/tile.tsx`.
4. Add a CSS tint + border-left color variable in `src/app/globals.css` (or reuse an existing `--state-*` token).

---

## `{}` Conventions

- Files under **300 lines**. Split, don't grow.
- No `any`. Narrow `unknown`. `noUncheckedIndexedAccess` is on.
- No `console.log` : use `createLogger("scope")` from `src/lib/util/logger.ts`.
- API routes validate input with **zod**. The WS protocol is typed both ends via `src/lib/shared/ws-protocol.ts`.
- Client components live in `src/components/`. Server components stay default unless interactivity is required.

---

## `/*` Repo layout

```
clarmy/
├─ server.ts                 custom Next + WebSocket bootstrap
├─ src/
│  ├─ app/                   RSC pages + route handlers (sessions, metrics, quotas, crons…)
│  ├─ components/
│  │  ├─ tile/               one component per session state
│  │  ├─ shell/              frame, sidebar, quota gauges, ASCII bars
│  │  ├─ views/              focus, history, metrics, agents, crons, MCP, skills…
│  │  ├─ overlays/           command palette, tweaks panel, dialogs
│  │  ├─ terminal/           node-pty + xterm host
│  │  └─ ui/                 primitives (segmented, button, card…)
│  ├─ lib/
│  │  ├─ orchestrator/       SessionManager, runners, state-machine, cron scheduler
│  │  ├─ providers/          CliDriver contract + claude / codex / gemini drivers
│  │  ├─ claude-code/        transcript scanner, live tailer, pricing engine
│  │  ├─ quota/              vendor rate-limit windows (OAuth usage, rollouts)
│  │  ├─ client/             Zustand store, theme + accent engine
│  │  ├─ shared/             cross-process types, model registry, ws protocol (zod)
│  │  └─ util/               logger, ids, invariants
│  └─ styles/                design tokens
├─ mocks/sessions/           JSONL fixtures for mock mode
├─ tests/integration/        vitest suites
└─ docs/                     providers, MCP server
```

---

<div align="center">

<sub>Built for operators who run coding agents like a fleet, not a toy.</sub>

<br/>

`pnpm dev` → `http://localhost:3010` → **unleash the army**

</div>
