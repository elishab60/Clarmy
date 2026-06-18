import { describe, it, expect } from "vitest";
import { perProvider, filterRows } from "../../src/components/views/metrics/aggregate.ts";
import type { Filters, SessionRow } from "../../src/components/views/metrics/types.ts";

// Minimal SessionRow factory; only the fields the aggregation reads matter, the
// rest are filled with inert defaults.
function row(p: Partial<SessionRow> & Pick<SessionRow, "provider">): SessionRow {
  return {
    id: p.id ?? Math.random().toString(36).slice(2),
    provider: p.provider,
    cwd: p.cwd ?? "/tmp/proj",
    project: p.project ?? "proj",
    model: p.model ?? "opus-4.8",
    rawModel: p.rawModel ?? null,
    startedAt: p.startedAt ?? 0,
    endedAt: p.endedAt ?? 1_000,
    day: p.day ?? "2026-06-18",
    input: p.input ?? 0,
    output: p.output ?? 0,
    cacheRead: p.cacheRead ?? 0,
    cacheCreate: p.cacheCreate ?? 0,
    toolUses: p.toolUses ?? 0,
    messages: p.messages ?? 0,
    cost: p.cost ?? 0,
    state: p.state ?? "done",
    daily: p.daily ?? {},
    ...(p.models ? { models: p.models } : {}),
  };
}

const ALL: Filters = { range: "all", providers: [], projects: [], models: [] };

describe("perProvider", () => {
  it("groups rows by provider, sums spend, labels via providerMeta, sorts by cost", () => {
    const rows = [
      row({ provider: "claude", cost: 3, input: 100, output: 10, toolUses: 2 }),
      row({ provider: "claude", cost: 1, input: 50, output: 5, toolUses: 1 }),
      row({ provider: "opencode", cost: 0, input: 36_601, output: 3_644, toolUses: 5 }),
    ];
    const groups = perProvider(rows);

    expect(groups.map((g) => g.key)).toEqual(["claude", "opencode"]); // cost desc
    const claude = groups.find((g) => g.key === "claude")!;
    expect(claude.label).toBe("Claude");
    expect(claude.sessions).toBe(2);
    expect(claude.cost).toBe(4);
    expect(claude.input).toBe(150);
    expect(claude.toolUses).toBe(3);

    const opencode = groups.find((g) => g.key === "opencode")!;
    expect(opencode.label).toBe("OpenCode");
    expect(opencode.cost).toBe(0); // subscription / uncatalogued pricing
    expect(opencode.output).toBe(3_644); // real tokens still counted
  });

  it("returns an empty list for no rows", () => {
    expect(perProvider([])).toEqual([]);
  });
});

describe("filterRows provider gate", () => {
  const rows = [
    row({ provider: "claude", cwd: "/a", model: "opus-4.8" }),
    row({ provider: "codex", cwd: "/a", model: "gpt-5" }),
    row({ provider: "opencode", cwd: "/b", model: "glm-5.2" }),
  ];

  it("keeps only the selected providers", () => {
    const out = filterRows(rows, { ...ALL, providers: ["opencode"] }, 10_000);
    expect(out.map((r) => r.provider)).toEqual(["opencode"]);
  });

  it("keeps every provider when the filter is empty", () => {
    expect(filterRows(rows, ALL, 10_000)).toHaveLength(3);
  });

  it("composes with the project filter (AND semantics)", () => {
    const out = filterRows(rows, { ...ALL, providers: ["claude", "codex"], projects: ["/a"] }, 10_000);
    expect(out.map((r) => r.provider).sort()).toEqual(["claude", "codex"]);
  });

  it("composes with the model filter", () => {
    const out = filterRows(rows, { ...ALL, providers: ["opencode"], models: ["glm-5.2"] }, 10_000);
    expect(out).toHaveLength(1);
    expect(filterRows(rows, { ...ALL, providers: ["opencode"], models: ["gpt-5"] }, 10_000)).toHaveLength(0);
  });
});
