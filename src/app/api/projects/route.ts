import { NextResponse } from "next/server";
import { getManager } from "@/lib/orchestrator/manager";
import { scanAll, projectsFromSessions } from "@/lib/claude-code/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mgr = getManager();
  const live = mgr.list();
  const liveByCwd: Record<string, number> = {};
  const liveByName: Record<string, number> = {};
  for (const s of live) {
    if (s.cwd) liveByCwd[s.cwd] = (liveByCwd[s.cwd] ?? 0) + 1;
    liveByName[s.project] = (liveByName[s.project] ?? 0) + 1;
  }

  const sessions = scanAll();
  const projects = projectsFromSessions(sessions).map((p) => ({
    ...p,
    liveSessions: (liveByCwd[p.cwd] ?? 0) + (liveByName[p.name] ?? 0),
  }));
  return NextResponse.json({ projects });
}
