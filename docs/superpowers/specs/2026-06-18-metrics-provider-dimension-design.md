# Metrics: provider dimension

Date: 2026-06-18
Status: approved, ready to implement

## Goal

Let the metrics page slice usage by provider, so the user can see how much each
tool (opencode, claude, codex, grok, gemini) consumed, and filter the whole page
to one or more providers. Per-model spend (e.g. `glm-5.2` under opencode) is
already covered by the existing "Per model" table and "Cost by model" donut; this
adds the missing provider axis.

## Context

The metrics page already has the full machinery for this pattern:

- `SessionRow` carries `provider` (`src/components/views/metrics/types.ts`).
- The top bar `visibleProviders` toggle pre-filters rows before aggregation
  (`metrics-page.tsx`), so this new filter drills *within* the visible set.
- `perProject` and `perModel` (`aggregate.ts`) already produce `GroupRow[]`,
  rendered by `GroupTable` and `Donut`. The per-project table is click-to-filter.

So the work is purely client side and mirrors an existing dimension. No API,
worker, or backend change.

## Changes

### 1. `metrics/types.ts`

Add `providers` to `Filters`:

```ts
export interface Filters {
  readonly range: RangeKey;
  readonly providers: readonly string[]; // ProviderId[]
  readonly projects: readonly string[];  // cwd[]
  readonly models: readonly string[];
}
```

### 2. `metrics/aggregate.ts`

- In `matchPM` (the shared matcher behind `filterRows`, `windowRows`, deltas),
  add the provider gate first:

  ```ts
  if (f.providers.length && !f.providers.includes(r.provider)) return false;
  ```

  Routing it through `matchPM` means range, deltas, heatmap, and over-time series
  all respect the provider filter with no extra wiring.

- Add `perProvider(rows)` built on the existing `group()` helper:

  ```ts
  import { providerMeta } from "../../../lib/shared/providers.ts";

  export function perProvider(rows: readonly SessionRow[]): GroupRow[] {
    return group(rows, (r) => r.provider, (r) => providerMeta(r.provider).label);
  }
  ```

  `providerMeta` is client-safe (no node imports), already used by
  `metrics-page.tsx`.

### 3. `metrics/filter-bar.tsx`

Add a `Providers` `MultiSelect` (the component already lives in this file) before
`Projects`. New props `providerOpts / selectedProviders / onProviders`. Fold
providers into the `dirty` check so `clear` appears when only a provider is set.

### 4. `metrics/tables.tsx`

Generalise `GroupTable` so `kind` accepts `"provider"`:

- `kind: "project" | "model" | "provider"`.
- `clickable = !!onToggle && (kind === "project" || kind === "provider")` so the
  provider table is click-to-filter like projects.
- Last column: provider follows the project layout (shows `last run`), model keeps
  `cache`. Generalise the existing `kind === "project"` checks to
  `kind !== "model"` for the column set and `minWidth`.

### 5. `metrics-page.tsx`

- `filters` initial state and `onClear` include `providers: []`.
- `allProviders = useMemo(() => perProvider(rows).map((g) => ({ key: g.key, label: g.label })), [rows])`.
- `view` adds `perProvider` and `costByProvider = topSlices(providers, 6, (g) => g.cost)`.
- Wire the new `FilterBar` props.
- Add a "Cost by provider" `Donut` and a "Per provider" `GroupTable` (click a row
  toggles the provider filter via a `toggleProvider` helper mirroring
  `toggleProject`). The provider donut joins the existing `.mx-donuts` row.

## Display notes

- opencode rows show real tokens / sessions but `$0` cost (subscription and
  uncatalogued pricing). That is correct, not a bug; the row simply has no dollar
  figure.
- The provider donut reuses `palette.ts` colors for consistency with the other
  donuts (provider accent colors are not used here). YAGNI.
- Three donuts now sit in `.mx-donuts`; verify the row wraps cleanly (CSS check,
  no layout redesign expected).

## Testing

`aggregate.ts` is pure. Add `tests/integration/metrics-aggregate.test.ts`
covering:

- `perProvider` groups rows by provider, labels via `providerMeta`, sums
  cost/tokens/sessions, sorts by cost.
- `filterRows` with `filters.providers` set keeps only matching providers and
  still composes with range / project / model filters.

UI wiring (filter bar, page) is verified by `pnpm typecheck` and `pnpm lint`; the
running daemon serves the build, so no manual `next build`.

## Out of scope

- No per-provider color theming of charts.
- No backend / worker / API changes.
- No change to the top-bar provider toggle behaviour.
