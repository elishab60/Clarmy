import { describe, it, expect } from "vitest";
import { estimateCost, priceFor } from "../../src/lib/claude-code/pricing.ts";

// estimateCost is sync and falls back to the static table when no live pricing
// has been fetched, so these assertions are deterministic in CI.
const M = 1_000_000;

describe("GLM / z.ai pricing", () => {
  it("prices the opencode zai-coding-plan flagship id (no longer $0)", () => {
    const c = estimateCost("zai-coding-plan/glm-5.2", { input: M, output: M, cacheRead: M });
    // 1.40 + 4.40 + 0.26 per million
    expect(c).toBeCloseTo(1.4 + 4.4 + 0.26, 6);
  });

  it("uses the cheaper air/turbo tier for -air and -turbo variants", () => {
    const flagship = priceFor("zai-coding-plan/glm-5.2").output;
    const air = priceFor("zai-coding-plan/glm-4.5-air").output;
    const turbo = priceFor("zai-coding-plan/glm-5v-turbo").output;
    expect(air).toBeLessThan(flagship);
    expect(turbo).toBe(air);
    expect(air).toBeCloseTo(2.93e-6, 9);
  });

  it("matches a bare glm id without the zai-coding-plan prefix", () => {
    expect(priceFor("glm-5.1").input).toBeCloseTo(1.4e-6, 9);
  });

  it("still returns zero for genuinely unknown models", () => {
    expect(estimateCost("totally-made-up-model", { input: M })).toBe(0);
  });
});
