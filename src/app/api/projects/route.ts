import { NextResponse } from "next/server";
import { getControl } from "@/lib/orchestrator/control";
import { projectsFromSessions } from "@/lib/claude-code/history";
import { getMetricsIndex } from "@/lib/providers/metrics-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Sessions and per-cwd aggregates come from the metrics index
// (stale-while-revalidate): no transcript walk on the request path. Live
// counts stay per-request; they are free.
export async function GET() {
  const [live, { sessions, perCwd }] = await Promise.all([
    getControl().list(),
    getMetricsIndex().sessions(),
  ]);
  const liveByCwd: Record<string, number> = {};
  const liveByName: Record<string, number> = {};
  for (const s of live) {
    if (s.cwd) liveByCwd[s.cwd] = (liveByCwd[s.cwd] ?? 0) + 1;
    liveByName[s.project] = (liveByName[s.project] ?? 0) + 1;
  }

  const agg = new Map(perCwd);
  const projects = projectsFromSessions(sessions).map((p) => {
    const t = agg.get(p.cwd);
    return {
      ...p,
      inputTokens: t?.inputTokens ?? 0,
      outputTokens: t?.outputTokens ?? 0,
      cacheReadTokens: t?.cacheReadTokens ?? 0,
      cacheCreateTokens: (t?.cacheCreate5mTokens ?? 0) + (t?.cacheCreate1hTokens ?? 0),
      messages: t?.messages ?? p.messages,
      liveSessions: (liveByCwd[p.cwd] ?? 0) + (liveByName[p.name] ?? 0),
    };
  });
  return NextResponse.json({ projects });
}
