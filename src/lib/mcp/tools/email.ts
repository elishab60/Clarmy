import { z } from "zod";
import { sendEmail } from "../../claude-code/email.ts";
import { buildDailyActivity, todayISO } from "../../claude-code/daily-activity.ts";
import { renderDigestEmail, type DigestData, type DigestProject } from "../../claude-code/email-template.ts";
import { jsonResult, errorResult, type ToolDef } from "./types.ts";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const SendSchema = z.object({
  to: z.string().email().max(200).optional(),
  from: z.string().max(200).optional(),
  subject: z.string().min(1).max(300),
  html: z.string().max(500_000).optional(),
  text: z.string().max(200_000).optional(),
});

const DigestSchema = z.object({
  date: z.string().regex(DATE_RE).optional(),
  to: z.string().email().max(200).optional(),
  from: z.string().max(200).optional(),
  subject: z.string().min(1).max(300).optional(),
  intro: z.string().max(2_000).optional(),
  summaries: z.array(z.object({
    cwd: z.string().min(1).max(500).optional(),
    project: z.string().min(1).max(200).optional(),
    summary: z.string().min(1).max(4_000),
  })).max(100).optional(),
});

const sendEmailTool: ToolDef = {
  name: "send_email",
  description: "Send a raw email via Resend. Uses the RESEND_API_KEY secret; to/from fall back to the COCKPIT_REPORT_TO / COCKPIT_REPORT_FROM secrets if omitted.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string" },
      from: { type: "string" },
      subject: { type: "string" },
      html: { type: "string" },
      text: { type: "string" },
    },
    required: ["subject"],
    additionalProperties: false,
  },
  async handle(args) {
    const parsed = SendSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    if (!parsed.data.html && !parsed.data.text) return errorResult("provide html or text");
    try {
      const { id } = await sendEmail(parsed.data);
      return jsonResult({ ok: true, id });
    } catch (e) {
      return errorResult(String(e instanceof Error ? e.message : e));
    }
  },
};

const sendDigestTool: ToolDef = {
  name: "send_digest_email",
  description: "Render and send the daily digest email. The server computes the real per-project numbers (sessions, tokens, cost) from local Claude Code transcripts; you only supply the per-project narrative via `summaries` (matched by cwd or project name). Numbers cannot be overridden.",
  inputSchema: {
    type: "object",
    properties: {
      date: { type: "string", description: "ISO YYYY-MM-DD. Defaults to today (UTC)." },
      to: { type: "string" },
      from: { type: "string" },
      subject: { type: "string", description: "Optional override; a sensible default is generated." },
      intro: { type: "string", description: "2 to 3 sentence overview of the whole day (narrative)." },
      summaries: {
        type: "array",
        description: "Per-project narrative. Match each by cwd (preferred) or project name.",
        items: {
          type: "object",
          properties: {
            cwd: { type: "string" },
            project: { type: "string" },
            summary: { type: "string" },
          },
          required: ["summary"],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
  async handle(args) {
    const parsed = DigestSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const date = parsed.data.date ?? todayISO();
    const act = buildDailyActivity(date);

    const byCwd = new Map<string, string>();
    const byProject = new Map<string, string>();
    for (const s of parsed.data.summaries ?? []) {
      if (s.cwd) byCwd.set(s.cwd, s.summary);
      if (s.project) byProject.set(s.project, s.summary);
    }

    const projects: DigestProject[] = act.projects.map((p) => ({
      project: p.project,
      cwd: p.cwd,
      sessions: p.sessions,
      inputTokens: p.inputTokens,
      outputTokens: p.outputTokens,
      cost: p.cost,
      summary: byCwd.get(p.cwd) ?? byProject.get(p.project) ?? "Activite enregistree (narratif non fourni).",
    }));

    const data: DigestData = { date: act.date, totals: act.totals, projects, intro: parsed.data.intro };
    const rendered = renderDigestEmail(data);
    try {
      const { id } = await sendEmail({
        to: parsed.data.to,
        from: parsed.data.from,
        subject: parsed.data.subject ?? rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      return jsonResult({ ok: true, id, date, projects: projects.length, sessions: act.totals.sessions, cost: Number(act.totals.cost.toFixed(2)) });
    } catch (e) {
      return errorResult(String(e instanceof Error ? e.message : e));
    }
  },
};

export const emailTools: readonly ToolDef[] = [sendEmailTool, sendDigestTool];
