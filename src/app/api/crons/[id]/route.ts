import { NextResponse } from "next/server";
import { z } from "zod";
import { getCron, updateCron, deleteCron } from "@/lib/claude-code/crons";
import { computeNextFire, parseCronExpression } from "@/lib/orchestrator/cron-scheduler";
import type { CronSchedule } from "@/lib/shared/cron-types";
import { isModelId, MODEL_IDS, ALL_EFFORTS } from "@/lib/shared/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cron = getCron(id);
  if (!cron) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ cron });
}

const ScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recurring"), expression: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("oneshot"), at: z.string().min(1).max(40) }),
]);

const SpawnSchema = z.object({
  project: z.string().min(1).max(200),
  cwd: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  model: z.string().refine(isModelId, { message: `model must be one of: ${MODEL_IDS.join(", ")}` }),
  prompt: z.string().min(1).max(50_000),
  allowedTools: z.array(z.string().min(1).max(60)).max(40).default([]),
  approvalMode: z.enum(["auto", "prompt", "strict"]).default("auto"),
  branch: z.string().max(200).optional(),
  dangerouslySkipPermissions: z.boolean().optional(),
  effort: z.enum(ALL_EFFORTS).optional(),
});

const PutBody = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  schedule: ScheduleSchema.optional(),
  spawn: SpawnSchema.optional(),
  enabled: z.boolean().optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const existing = getCron(id);
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = PutBody.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });

  const nextSchedule = (parsed.data.schedule ?? existing.schedule) as CronSchedule;
  if (parsed.data.schedule) {
    if (nextSchedule.kind === "recurring") {
      try { parseCronExpression(nextSchedule.expression); }
      catch (e) { return NextResponse.json({ error: "invalid_cron", message: (e as Error).message }, { status: 400 }); }
    } else {
      const t = new Date(nextSchedule.at);
      if (Number.isNaN(t.getTime())) return NextResponse.json({ error: "invalid_datetime" }, { status: 400 });
    }
  }

  const enabled = parsed.data.enabled ?? existing.enabled;
  const nextFire = enabled ? computeNextFire(nextSchedule, new Date()) : null;
  const updated = updateCron(id, {
    ...parsed.data,
    nextFireAt: nextFire ? nextFire.toISOString() : undefined,
  });
  return NextResponse.json({ cron: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const ok = deleteCron(id);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
