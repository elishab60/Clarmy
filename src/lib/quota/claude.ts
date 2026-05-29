import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { scanAll, type CCUsageRecord } from "@/lib/claude-code/history";
import { estimateCost, refreshPricing } from "@/lib/claude-code/pricing";
import { createLogger } from "@/lib/util/logger";
import type { ProviderQuota } from "@/lib/shared/quota";

const log = createLogger("quota/claude");
const HOUR_MS = 3_600_000;

// Claude Code (Max plan) enforces a rolling N-hour window but exposes no token
// or message quota locally. We model the gauge as "current window cost relative
// to your busiest-ever window of the same length": a self-calibrating baseline
// that needs no unpublished numbers. Override with COCKPIT_CLAUDE_QUOTA_LIMIT_USD.
function windowHours(): number {
  const raw = Number(process.env.COCKPIT_QUOTA_WINDOW_HOURS);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

function planLabel(): string | null {
  try {
    const path = resolve(homedir(), ".claude", ".credentials.json");
    const j = JSON.parse(readFileSync(path, "utf8")) as {
      claudeAiOauth?: { rateLimitTier?: unknown; subscriptionType?: unknown };
    };
    const tier = j.claudeAiOauth?.rateLimitTier;
    if (typeof tier === "string") {
      const t = tier.toLowerCase();
      if (t.includes("max_20x") || t.includes("max20")) return "Max 20x";
      if (t.includes("max_5x") || t.includes("max5")) return "Max 5x";
      if (t.includes("max")) return "Max";
      if (t.includes("pro")) return "Pro";
    }
    const sub = j.claudeAiOauth?.subscriptionType;
    if (typeof sub === "string" && sub) return sub.charAt(0).toUpperCase() + sub.slice(1);
  } catch { /* no credentials file: plan stays unknown */ }
  return null;
}

function recCost(r: CCUsageRecord, fallbackModel: string | undefined): number {
  return estimateCost(r.model ?? fallbackModel, {
    input: r.inputTokens,
    output: r.outputTokens,
    cacheRead: r.cacheReadTokens,
    cacheCreate5m: r.cacheCreate5mTokens,
    cacheCreate1h: r.cacheCreate1hTokens,
  });
}

export async function getClaudeQuota(): Promise<ProviderQuota> {
  await refreshPricing();
  const plan = planLabel();
  const windowMs = windowHours() * HOUR_MS;

  let events: { ts: number; cost: number }[] = [];
  try {
    const sessions = scanAll();
    const seen = new Set<string>();
    for (const s of sessions) {
      for (const r of s.usage) {
        if (r.key) {
          if (seen.has(r.key)) continue;
          seen.add(r.key);
        }
        if (!r.ts) continue;
        events.push({ ts: r.ts, cost: recCost(r, s.model) });
      }
    }
  } catch (err) {
    log.error("scan failed", { err: String(err) });
    return {
      provider: "claude", label: "Claude", state: "error", plan,
      usedPercent: null, windows: [], detail: "read error", source: "claude-jsonl", asOf: null,
    };
  }

  if (events.length === 0) {
    return {
      provider: "claude", label: "Claude", state: "unknown", plan,
      usedPercent: null, windows: [], detail: "no recent usage", source: "claude-jsonl", asOf: null,
    };
  }

  events = events.sort((a, b) => a.ts - b.ts);
  const now = Date.now();
  const cutoff = now - windowMs;

  let current = 0;
  let earliestInWindow = now;
  for (const e of events) {
    if (e.ts >= cutoff) {
      current += e.cost;
      if (e.ts < earliestInWindow) earliestInWindow = e.ts;
    }
  }

  // Busiest window of the same length over all history (two-pointer max).
  let baseline = 0;
  let sum = 0;
  let head = 0;
  for (let tail = 0; tail < events.length; tail++) {
    const cur = events[tail];
    if (!cur) continue;
    sum += cur.cost;
    let h = events[head];
    while (h && h.ts <= cur.ts - windowMs) {
      sum -= h.cost;
      head++;
      h = events[head];
    }
    if (sum > baseline) baseline = sum;
  }

  const envLimit = Number(process.env.COCKPIT_CLAUDE_QUOTA_LIMIT_USD);
  const limit = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : baseline;
  const pct = limit > 0 ? Math.min(100, Math.max(0, (current / limit) * 100)) : 0;
  const resetsAt = current > 0 ? earliestInWindow + windowMs : null;
  const peakLabel = Number.isFinite(envLimit) && envLimit > 0 ? "limit" : "peak";

  return {
    provider: "claude",
    label: "Claude",
    state: "ok",
    plan,
    usedPercent: pct,
    windows: [{ label: `${windowHours()}h`, usedPercent: pct, windowMinutes: windowHours() * 60, resetsAt }],
    detail: `$${current.toFixed(2)} / ${peakLabel} $${limit.toFixed(2)}`,
    source: "claude-jsonl",
    asOf: now,
  };
}
