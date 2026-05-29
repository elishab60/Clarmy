import { z } from "zod";
import { createCron, listCrons, setNextFire } from "../../claude-code/crons.ts";
import { computeNextFire, validateCronExpression } from "../../orchestrator/cron-scheduler.ts";
import { isModelId, MODEL_IDS, ALL_EFFORTS } from "../../shared/models.ts";
import type { ApprovalMode, Effort, ModelId } from "../../shared/types.ts";
import type { CronSchedule, CronSpawnSpec } from "../../shared/cron-types.ts";
import { jsonResult, errorResult, type ToolDef } from "./types.ts";

const ScheduleSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recurring"), expression: z.string().min(1).max(120) }),
  z.object({ kind: z.literal("oneshot"), at: z.string().min(1).max(40) }),
]);

const SpawnSpecSchema = z.object({
  project: z.string().min(1).max(200),
  cwd: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  model: z.string().refine(isModelId, { message: `model must be one of: ${MODEL_IDS.join(", ")}` }),
  prompt: z.string().min(1).max(50_000),
  allowedTools: z.array(z.string().min(1).max(60)).max(40).optional(),
  approvalMode: z.enum(["auto", "prompt", "strict"]).optional(),
  branch: z.string().max(200).optional(),
  effort: z.enum(ALL_EFFORTS).optional(),
  dangerouslySkipPermissions: z.boolean().optional(),
});

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  enabled: z.boolean().optional(),
  schedule: ScheduleSchema,
  spawn: SpawnSpecSchema,
});

const spawnSpecJsonSchema = {
  type: "object",
  properties: {
    project: { type: "string" },
    cwd: { type: "string" },
    name: { type: "string" },
    model: { type: "string", enum: [...MODEL_IDS] },
    prompt: { type: "string" },
    allowedTools: { type: "array", items: { type: "string" } },
    approvalMode: { type: "string", enum: ["auto", "prompt", "strict"] },
    branch: { type: "string" },
    effort: { type: "string", enum: [...ALL_EFFORTS] },
    dangerouslySkipPermissions: { type: "boolean" },
  },
  required: ["project", "cwd", "name", "model", "prompt"],
  additionalProperties: false,
};

function toSpawnSpec(s: z.infer<typeof SpawnSpecSchema>): CronSpawnSpec {
  return {
    project: s.project,
    cwd: s.cwd,
    name: s.name,
    model: s.model as ModelId,
    prompt: s.prompt,
    allowedTools: s.allowedTools ?? ["Read", "Grep", "Glob"],
    approvalMode: (s.approvalMode ?? "prompt") as ApprovalMode,
    branch: s.branch,
    effort: s.effort as Effort | undefined,
    dangerouslySkipPermissions: s.dangerouslySkipPermissions,
  };
}

const createCronTool: ToolDef = {
  name: "create_cron",
  description: "Create a cron job that spawns a session on a schedule (recurring cron expression or oneshot ISO time).",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
      enabled: { type: "boolean", description: "Defaults to true." },
      schedule: {
        oneOf: [
          {
            type: "object",
            properties: { kind: { const: "recurring" }, expression: { type: "string", description: "5-field cron, e.g. 0 9 * * 1-5" } },
            required: ["kind", "expression"],
          },
          {
            type: "object",
            properties: { kind: { const: "oneshot" }, at: { type: "string", description: "Future ISO timestamp." } },
            required: ["kind", "at"],
          },
        ],
      },
      spawn: spawnSpecJsonSchema,
    },
    required: ["name", "schedule", "spawn"],
    additionalProperties: false,
  },
  async handle(args) {
    const parsed = CreateSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const schedule = parsed.data.schedule as CronSchedule;
    if (schedule.kind === "recurring") {
      const v = validateCronExpression(schedule.expression);
      if (!v.ok) return errorResult(`invalid_cron: ${v.error}`);
    } else {
      const t = new Date(schedule.at);
      if (Number.isNaN(t.getTime())) return errorResult(`invalid_oneshot_time: ${schedule.at}`);
      if (t.getTime() <= Date.now()) return errorResult("oneshot time must be in the future");
    }
    const enabled = parsed.data.enabled ?? true;
    const job = createCron({
      name: parsed.data.name,
      description: parsed.data.description,
      enabled,
      schedule,
      spawn: toSpawnSpec(parsed.data.spawn),
    });
    let nextFireAt: string | undefined;
    if (enabled) {
      const next = computeNextFire(schedule, new Date());
      nextFireAt = next ? next.toISOString() : undefined;
      setNextFire(job.id, nextFireAt);
    }
    return jsonResult({ id: job.id, name: job.name, enabled, nextFireAt });
  },
};

const listCronsTool: ToolDef = {
  name: "list_crons",
  description: "List all cron jobs with their schedule, next fire and last run.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async handle() {
    const jobs = listCrons().map((c) => ({
      id: c.id,
      name: c.name,
      enabled: c.enabled,
      schedule: c.schedule,
      nextFireAt: c.nextFireAt,
      lastFiredAt: c.lastFiredAt,
      runCount: c.runCount,
      lastRun: c.lastRun,
    }));
    return jsonResult({ count: jobs.length, jobs });
  },
};

export const cronTools: readonly ToolDef[] = [createCronTool, listCronsTool];
