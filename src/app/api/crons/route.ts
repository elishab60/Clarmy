import { NextResponse } from "next/server";
import { z } from "zod";
import { listCrons, createCron } from "@/lib/claude-code/crons";
import { computeNextFire, parseCronExpression } from "@/lib/orchestrator/cron-scheduler";
import type { CronSchedule } from "@/lib/shared/cron-types";
import { isModelId, MODEL_IDS, ALL_EFFORTS } from "@/lib/shared/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jobs = listCrons();
  const now = new Date();
  const enriched = jobs.map((j) => ({
    ...j,
    nextFireAt: j.nextFireAt ?? (j.enabled ? computeNextFire(j.schedule, now)?.toISOString() : undefined),
  }));
  return NextResponse.json({
    crons: enriched,
    totals: {
      total: jobs.length,
      enabled: jobs.filter((j) => j.enabled).length,
      recurring: jobs.filter((j) => j.schedule.kind === "recurring").length,
      oneshot: jobs.filter((j) => j.schedule.kind === "oneshot").length,
    },
  });
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
  secretKeys: z.array(z.string().min(1).max(128)).max(50).optional(),
});

const CreateBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  schedule: ScheduleSchema,
  spawn: SpawnSchema,
  enabled: z.boolean().default(true),
});

export async function POST(req: Request) {
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = CreateBody.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }
  const schedule = parsed.data.schedule as CronSchedule;
  if (schedule.kind === "recurring") {
    try { parseCronExpression(schedule.expression); }
    catch (e) { return NextResponse.json({ error: "invalid_cron", message: (e as Error).message }, { status: 400 }); }
  } else {
    const t = new Date(schedule.at);
    if (Number.isNaN(t.getTime())) return NextResponse.json({ error: "invalid_datetime" }, { status: 400 });
  }
  const next = computeNextFire(schedule, new Date());
  const job = createCron({
    name: parsed.data.name,
    description: parsed.data.description,
    schedule,
    spawn: parsed.data.spawn,
    enabled: parsed.data.enabled,
    nextFireAt: next ? next.toISOString() : undefined,
  });
  return NextResponse.json({ cron: job }, { status: 201 });
}
