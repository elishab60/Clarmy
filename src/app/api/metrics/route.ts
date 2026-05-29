import { NextResponse } from "next/server";
import { getControl } from "@/lib/orchestrator/control";
import { scanAll } from "@/lib/claude-code/history";
import { estimateCost, refreshPricing } from "@/lib/claude-code/pricing";
import { modelFromApiId } from "@/lib/shared/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns one compact row per recorded session. The client filters by range /
// project / model and aggregates everything (KPIs, heatmap, donuts, tables) so
// changing a filter never refetches. Cost is computed here with global usage
// dedup so headline totals match the orchestrator's accounting.
export async function GET() {
  await refreshPricing();
  const live = await getControl().list();
  const sessions = scanAll();

  const seen = new Set<string>();
  const rows = sessions.map((s) => {
    let cost = 0;
    for (const r of s.usage) {
      if (r.key) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
      }
      cost += estimateCost(r.model ?? s.model, {
        input: r.inputTokens,
        output: r.outputTokens,
        cacheRead: r.cacheReadTokens,
        cacheCreate5m: r.cacheCreate5mTokens,
        cacheCreate1h: r.cacheCreate1hTokens,
      });
    }
    const endedAt = s.endedAt || s.startedAt;
    return {
      id: s.id,
      cwd: s.cwd,
      project: s.project,
      model: modelFromApiId(s.model ?? null) ?? s.model ?? "unknown",
      rawModel: s.model ?? null,
      startedAt: s.startedAt,
      endedAt,
      day: endedAt ? new Date(endedAt).toISOString().slice(0, 10) : null,
      input: s.inputTokens,
      output: s.outputTokens,
      cacheRead: s.cacheReadTokens,
      cacheCreate: s.cacheCreateTokens,
      toolUses: s.toolUses,
      messages: s.messageCount,
      cost,
      state: s.state,
    };
  });

  return NextResponse.json({
    generatedAt: Date.now(),
    liveSessions: live.length,
    sessions: rows,
  });
}
