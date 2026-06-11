# Contributing to CLARMY

Thanks for considering a contribution. The codebase is small on purpose; this
page is everything you need.

## Setup

```bash
pnpm install
COCKPIT_MOCK=1 pnpm dev   # zero-key dev loop on :3010 (fixture replay)
```

`pnpm dev` with a real `ANTHROPIC_API_KEY` (or the `claude` CLI logged in)
pilots real sessions. `clarmy doctor` diagnoses your environment.

## Checks

Everything CI runs, run locally first:

```bash
pnpm typecheck    # strict TS, no emit
pnpm test         # vitest integration suite (hermetic: never touches your ~/.claude)
pnpm build        # production build
pnpm test:e2e     # playwright smoke against the prod server in mock mode
```

## Ground rules

- Files under **300 lines**: split, don't grow.
- No `any` (narrow `unknown`), `noUncheckedIndexedAccess` is on.
- No `console.log`: `createLogger("scope")` from `src/lib/util/logger.ts`.
- API routes validate input with zod; the WS protocol is typed both ends in
  `src/lib/shared/ws-protocol.ts`.
- Code loaded by `server.ts` (the node graph) must use **relative imports**:
  the `@/` alias only resolves inside Next's bundler. Singletons shared across
  both module graphs live on `globalThis` (see `manager.ts`, `metrics-index.ts`).
- Tests are hermetic: build a fixture home with `makeClaudeHome()` and set
  `COCKPIT_CLAUDE_HOME`; never read or write the developer's real config.

## Adding a tile state

Four type-enforced steps, documented in `CLAUDE.md`.

## Commit style

Conventional commits (`feat:`, `fix:`, `perf:`, `docs:`...), imperative subject,
body explains the why. One logical change per commit.
