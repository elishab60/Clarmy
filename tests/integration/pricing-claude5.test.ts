import { describe, it, expect } from "vitest";
import { estimateCost, priceFor } from "../../src/lib/claude-code/pricing.ts";

// estimateCost is sync and uses the static fallback table when no live pricing
// has been fetched, which is the state in tests.

const M = 1_000_000;

describe("Claude 5 family pricing", () => {
  it("prices claude-fable-5 by its exact api id", () => {
    expect(estimateCost("claude-fable-5", { input: M, output: M })).toBeCloseTo(60, 5);
  });

  it("prices the cockpit vanity id mythos as fable", () => {
    const p = priceFor("mythos");
    expect(p.input).toBeGreaterThan(0);
    expect(estimateCost("mythos", { input: M, output: M })).toBeCloseTo(60, 5);
  });

  it("routes mythos-flavoured api ids to fable pricing", () => {
    expect(estimateCost("anthropic.claude-mythos-preview", { input: M, output: M })).toBeCloseTo(60, 5);
  });

  it("prices sonnet-5 (cockpit id) and claude-sonnet-5 identically", () => {
    const a = estimateCost("sonnet-5", { input: M, output: M });
    const b = estimateCost("claude-sonnet-5", { input: M, output: M });
    expect(a).toBeCloseTo(18, 5);
    expect(b).toBeCloseTo(18, 5);
  });

  it("prices the cockpit id opus-4.8 at Opus 4.8 rates, not Opus 4.1", () => {
    expect(estimateCost("opus-4.8", { input: M, output: M })).toBeCloseTo(30, 5);
  });
});
