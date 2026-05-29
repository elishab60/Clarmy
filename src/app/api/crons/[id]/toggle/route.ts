import { NextResponse } from "next/server";
import { getCron, updateCron } from "@/lib/claude-code/crons";
import { computeNextFire } from "@/lib/orchestrator/cron-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const existing = getCron(id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const nextEnabled = !existing.enabled;
  const nextFire = nextEnabled ? computeNextFire(existing.schedule, new Date()) : null;
  const updated = updateCron(id, { enabled: nextEnabled, nextFireAt: nextFire ? nextFire.toISOString() : undefined });
  return NextResponse.json({ cron: updated });
}
