import { NextResponse } from "next/server";
import { getManager } from "@/lib/orchestrator/manager";
import { scanAll, projectsFromSessions } from "@/lib/claude-code/history";
import { estimateCost } from "@/lib/claude-code/pricing";
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

export async function GET() {
  const mgr = getManager();
  const sessions = scanAll();
  const projects = projectsFromSessions(sessions);

  let totalIn = 0, totalOut = 0, totalCacheRead = 0, totalCacheCreate = 0, totalTools = 0;
  let totalCost = 0;
  let done = 0, errored = 0;

  const perModel = new Map<string, { sessions: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreateTokens: number; costUsd: number }>();
  const perDay = new Map<string, { sessions: number; messages: number; toolUses: number; costUsd: number }>();
  const costByCwd = new Map<string, number>();

  for (const s of sessions) {
    totalIn += s.inputTokens;
    totalOut += s.outputTokens;
    totalCacheRead += s.cacheReadTokens;
    totalCacheCreate += s.cacheCreateTokens;
    totalTools += s.toolUses;

    const cost = estimateCost(s.model, {
      input: s.inputTokens,
      output: s.outputTokens,
      cacheRead: s.cacheReadTokens,
      cacheCreate: s.cacheCreateTokens,
    });
    totalCost += cost;
    costByCwd.set(s.cwd, (costByCwd.get(s.cwd) ?? 0) + cost);

    if (s.state === "done") done++; else if (s.state === "error") errored++;

    const rawModel = s.model ?? "unknown";
    const label = MODEL_ALIAS[rawModel] ?? rawModel;
    const pm = perModel.get(label) ?? { sessions: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreateTokens: 0, costUsd: 0 };
    pm.sessions += 1;
    pm.inputTokens += s.inputTokens;
    pm.outputTokens += s.outputTokens;
    pm.cacheReadTokens += s.cacheReadTokens;
    pm.cacheCreateTokens += s.cacheCreateTokens;
    pm.costUsd += cost;
    perModel.set(label, pm);

    if (s.endedAt) {
      const day = new Date(s.endedAt).toISOString().slice(0, 10);
      const pd = perDay.get(day) ?? { sessions: 0, messages: 0, toolUses: 0, costUsd: 0 };
      pd.sessions += 1;
      pd.messages += s.messageCount;
      pd.toolUses += s.toolUses;
      pd.costUsd += cost;
      perDay.set(day, pd);
    }
  }

  const today = new Date();
  const last7: { day: string; sessions: number; messages: number; toolUses: number; costUsd: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 24 * 3600 * 1000);
    const key = d.toISOString().slice(0, 10);
    const v = perDay.get(key) ?? { sessions: 0, messages: 0, toolUses: 0, costUsd: 0 };
    last7.push({ day: key, ...v });
  }

  return NextResponse.json({
    metrics: {
      totalSessions: sessions.length,
      liveSessions: mgr.list().length,
      doneSessions: done,
      errorSessions: errored,
      totalInputTokens: totalIn,
      totalOutputTokens: totalOut,
      totalCacheReadTokens: totalCacheRead,
      totalCacheCreateTokens: totalCacheCreate,
      totalToolCalls: totalTools,
      totalCostUsd: totalCost,
      perProject: projects.map((p) => ({
        project: p.name,
        cwd: p.cwd,
        sessions: p.sessions,
        inputTokens: p.inputTokens,
        outputTokens: p.outputTokens,
        cacheReadTokens: p.cacheReadTokens,
        toolUses: p.toolUses,
        lastRunAt: p.lastRunAt,
        costUsd: costByCwd.get(p.cwd) ?? 0,
      })).sort((a, b) => b.costUsd - a.costUsd),
      perModel: Array.from(perModel.entries())
        .map(([model, v]) => ({ model, ...v }))
        .sort((a, b) => b.costUsd - a.costUsd),
      lastSevenDays: last7,
    },
  });
}
