import { statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { z } from "zod";
import { getControl } from "../../orchestrator/control.ts";
import { getBus } from "../bus.ts";
import { isModelId, MODEL_IDS, ALL_EFFORTS, providerOfModel } from "../../shared/models.ts";
import { DEFAULT_PROVIDER } from "../../shared/providers.ts";
import type { ApprovalMode, Effort, ModelId, SessionSnapshot } from "../../shared/types.ts";
import { jsonResult, errorResult, type ToolDef } from "./types.ts";

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return resolve(p);
}

// Trim a snapshot to the fields a peer session actually needs.
function compact(s: SessionSnapshot) {
  return {
    id: s.id,
    name: s.name,
    project: s.project,
    state: s.state,
    model: s.model,
    tool: s.tool,
    elapsed: s.elapsed,
    cost: s.cost,
    inputTokens: s.inputTokens ?? 0,
    outputTokens: s.outputTokens ?? 0,
    toolsUsed: s.toolsUsed,
    todos: s.todos,
    todosDone: s.todosDone,
    branch: s.branch,
    cwd: s.cwd,
  };
}

const listSessions: ToolDef = {
  name: "list_sessions",
  description: "List every live cockpit session with its state, model and metrics.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async handle() {
    const sessions = await getControl().list();
    return jsonResult({ count: sessions.length, sessions: sessions.map(compact) });
  },
};

const GetSchema = z.object({ id: z.string().min(1).max(80) });

const getSession: ToolDef = {
  name: "get_session",
  description: "Get the full snapshot of one session by id.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "Session id, e.g. s_ab12cd" } },
    required: ["id"],
    additionalProperties: false,
  },
  async handle(args) {
    const parsed = GetSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const snap = await getControl().get(parsed.data.id);
    if (!snap) return errorResult(`not_found: ${parsed.data.id}`);
    return jsonResult(snap);
  },
};

const SummarizeSchema = z.object({ includeCrons: z.boolean().optional() });

const summarizeAll: ToolDef = {
  name: "summarize_all",
  description: "Roll up the whole fleet: per-session lines, totals, state counts, pending messages.",
  inputSchema: {
    type: "object",
    properties: { includeCrons: { type: "boolean", description: "Append the cron jobs summary." } },
    additionalProperties: false,
  },
  async handle(args) {
    const parsed = SummarizeSchema.safeParse(args ?? {});
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const sessions = await getControl().list();
    const counts = getBus().counts();
    const stateCounts: Record<string, number> = {};
    let cost = 0, input = 0, output = 0, tools = 0;
    for (const s of sessions) {
      stateCounts[s.state] = (stateCounts[s.state] ?? 0) + 1;
      cost += s.cost;
      input += s.inputTokens ?? 0;
      output += s.outputTokens ?? 0;
      tools += s.toolsUsed;
    }
    const summary = {
      generatedAt: Date.now(),
      totals: {
        sessions: sessions.length,
        cost: Number(cost.toFixed(4)),
        inputTokens: input,
        outputTokens: output,
        toolCalls: tools,
      },
      stateCounts,
      pendingMessages: counts,
      sessions: sessions.map((s) => ({ ...compact(s), unread: counts[s.id] ?? 0 })),
      ...(parsed.data.includeCrons ? { crons: await cronSummary() } : {}),
    };
    return jsonResult(summary);
  },
};

async function cronSummary() {
  const { listCrons } = await import("../../claude-code/crons.ts");
  return listCrons().map((c) => ({
    id: c.id,
    name: c.name,
    enabled: c.enabled,
    schedule: c.schedule,
    nextFireAt: c.nextFireAt,
    runCount: c.runCount,
    lastRun: c.lastRun,
  }));
}

const SpawnSchema = z.object({
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

const spawnSession: ToolDef = {
  name: "spawn_session",
  description: "Spawn a new piloted Claude Code session. Returns the new session id.",
  inputSchema: {
    type: "object",
    properties: {
      project: { type: "string" },
      cwd: { type: "string", description: "Working directory (absolute or ~)." },
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
  },
  async handle(args) {
    const parsed = SpawnSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const cwd = expandHome(parsed.data.cwd);
    try {
      if (!statSync(cwd).isDirectory()) return errorResult(`cwd_not_directory: ${cwd}`);
    } catch {
      return errorResult(`cwd_not_found: ${cwd}`);
    }
    try {
      const id = await getControl().spawn({
        // The model already pins the vendor; derive the provider from it so the
        // spawned session uses the right CLI driver (matches /api/sessions).
        provider: providerOfModel(parsed.data.model) ?? DEFAULT_PROVIDER,
        project: parsed.data.project,
        cwd,
        name: parsed.data.name,
        model: parsed.data.model as ModelId,
        prompt: parsed.data.prompt,
        allowedTools: parsed.data.allowedTools ?? ["Read", "Grep", "Glob"],
        approvalMode: (parsed.data.approvalMode ?? "prompt") as ApprovalMode,
        branch: parsed.data.branch,
        effort: parsed.data.effort as Effort | undefined,
        dangerouslySkipPermissions: parsed.data.dangerouslySkipPermissions,
      });
      return jsonResult({ id });
    } catch (err) {
      return errorResult(err instanceof Error ? err.message : String(err));
    }
  },
};

const KillSchema = z.object({ id: z.string().min(1).max(80) });

const killSession: ToolDef = {
  name: "kill_session",
  description: "Terminate a piloted session by id.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  async handle(args, ctx) {
    const parsed = KillSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    if (parsed.data.id === ctx.sessionId) return errorResult("refusing to kill the calling session");
    const ok = await getControl().kill(parsed.data.id);
    getBus().forget(parsed.data.id);
    return jsonResult({ ok });
  },
};

export const sessionTools: readonly ToolDef[] = [
  listSessions,
  getSession,
  summarizeAll,
  spawnSession,
  killSession,
];
