import { z } from "zod";
import { buildDailyActivity, todayISO } from "../../claude-code/daily-activity.ts";
import { jsonResult, errorResult, type ToolDef } from "./types.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const Schema = z.object({ date: z.string().regex(DATE_RE).optional() });

const getDailyActivityTool: ToolDef = {
  name: "get_daily_activity",
  description: "Real per-project Claude Code activity for a day (default today, UTC), reconstructed from local transcripts: sessions, input/output tokens, estimated cost, session ids, transcript file paths and the first prompts. Deterministic source of truth for the daily digest.",
  inputSchema: {
    type: "object",
    properties: { date: { type: "string", description: "ISO YYYY-MM-DD. Defaults to today (UTC)." } },
    additionalProperties: false,
  },
  async handle(args) {
    const parsed = Schema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const date = parsed.data.date ?? todayISO();
    const act = buildDailyActivity(date);
    return jsonResult(act);
  },
};

export const metricsTools: readonly ToolDef[] = [getDailyActivityTool];
