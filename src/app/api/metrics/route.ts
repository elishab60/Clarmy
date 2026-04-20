import { NextResponse } from "next/server";
import { getManager } from "@/lib/orchestrator/manager";
import { scanAll, projectsFromSessions, aggregateUsage, type CCUsageRecord } from "@/lib/claude-code/history";
import { estimateCost, refreshPricing } from "@/lib/claude-code/pricing";
import type { ModelId } from "@/lib/shared/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL_ALIAS: Record<string, ModelId> = {
  "claude-opus-4-7": "opus-4.7",
  "claude-opus-4-6": "opus-4.7",
  "claude-sonnet-4-6": "sonnet-4.6",
  "claude-haiku-4-5-20251001": "haiku-4.5",
  "claude-haiku-4-5": "haiku-4.5",
};

const cost = (model: string | undefined, r: CCUsageRecord): number => estimateCost(model, {
  input: r.inputTokens,
  output: r.outputTokens,
  cacheRead: r.cacheReadTokens,
  cacheCreate5m: r.cacheCreate5mTokens,
  cacheCreate1h: r.cacheCreate1hTokens,
});

export async function GET() {
  await refreshPricing();

  const mgr = getManager();
  const sessions = scanAll();
  const agg = aggregateUsage(sessions, cost);
  const projects = projectsFromSessions(sessions);

  let done = 0, errored = 0;
  for (const s of sessions) {
    if (s.state === "done") done++; else if (s.state === "error") errored++;
  }

  const perModel = Array.from(agg.perModel.entries()).map(([rawModel, t]) => ({
    model: MODEL_ALIAS[rawModel] ?? rawModel,
    sessions: t.sessions,
    inputTokens: t.inputTokens,
    outputTokens: t.outputTokens,
    cacheReadTokens: t.cacheReadTokens,
    cacheCreateTokens: t.cacheCreate5mTokens + t.cacheCreate1hTokens,
    costUsd: t.costUsd,
  })).sort((a, b) => b.costUsd - a.costUsd);

  const today = new Date();
  const last7: { day: string; sessions: number; messages: number; toolUses: number; costUsd: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    const pd = agg.perDay.get(key);
    last7.push({
      day: key,
      sessions: pd?.sessions ?? 0,
      messages: pd?.messages ?? 0,
      toolUses: pd?.toolUses ?? 0,
      costUsd: pd?.costUsd ?? 0,
    });
  }

  return NextResponse.json({
    metrics: {
      totalSessions: sessions.length,
      liveSessions: mgr.list().length,
      doneSessions: done,
      errorSessions: errored,
      totalInputTokens: agg.totals.inputTokens,
      totalOutputTokens: agg.totals.outputTokens,
      totalCacheReadTokens: agg.totals.cacheReadTokens,
      totalCacheCreateTokens: agg.totals.cacheCreate5mTokens + agg.totals.cacheCreate1hTokens,
      totalToolCalls: sessions.reduce((n, s) => n + s.toolUses, 0),
      totalCostUsd: agg.totals.costUsd,
      duplicateMessagesSkipped: agg.duplicateMessages,
      perProject: projects.map((p) => {
        const t = agg.perCwd.get(p.cwd);
        return {
          project: p.name,
          cwd: p.cwd,
          sessions: p.sessions,
          inputTokens: t?.inputTokens ?? 0,
          outputTokens: t?.outputTokens ?? 0,
          cacheReadTokens: t?.cacheReadTokens ?? 0,
          toolUses: p.toolUses,
          lastRunAt: p.lastRunAt,
          costUsd: t?.costUsd ?? 0,
        };
      }).sort((a, b) => b.costUsd - a.costUsd),
      perModel,
      lastSevenDays: last7,
    },
  });
}
