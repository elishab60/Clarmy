import { NextResponse } from "next/server";
import { getControl } from "@/lib/orchestrator/control";
import { scanAll, projectsFromSessions, aggregateUsage } from "@/lib/claude-code/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const live = await getControl().list();
  const liveByCwd: Record<string, number> = {};
  const liveByName: Record<string, number> = {};
  for (const s of live) {
    if (s.cwd) liveByCwd[s.cwd] = (liveByCwd[s.cwd] ?? 0) + 1;
    liveByName[s.project] = (liveByName[s.project] ?? 0) + 1;
  }

  const sessions = scanAll();
  const agg = aggregateUsage(sessions);
  const projects = projectsFromSessions(sessions).map((p) => {
    const t = agg.perCwd.get(p.cwd);
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
