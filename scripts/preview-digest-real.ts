// Renders the digest from REAL activity (your ~/.claude/projects transcripts).
// Usage:
//   node --experimental-transform-types scripts/preview-digest-real.ts [YYYY-MM-DD]
// To also send via Resend:
//   SEND=1 RESEND_API_KEY=xxx [REPORT_FROM=..] [REPORT_TO=..] node --experimental-transform-types scripts/preview-digest-real.ts
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildDailyActivity } from "../src/lib/claude-code/daily-activity.ts";
import { renderDigestEmail, type DigestData, type DigestProject } from "../src/lib/claude-code/email-template.ts";

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const act = buildDailyActivity(date);

function isNoise(p: string): boolean {
  const s = p.trim().toLowerCase();
  if (!s) return true;
  if (s.startsWith("<")) return true; // <local-command-caveat>, <command-name>, etc
  return ["local-command", "caveat:", "command-name", "command-message", "system-reminder"].some((n) => s.includes(n));
}

function summarize(prompts: readonly string[]): string {
  const uniq = [...new Set(prompts.map((p) => p.trim()).filter((p) => p && !isNoise(p)))].slice(0, 3);
  if (!uniq.length) return "Sessions automatisees ou reprises (pas de prompt utilisateur clair capture).";
  return "Travail du jour: " + uniq.map((p) => `"${p.length > 90 ? p.slice(0, 90) + "..." : p}"`).join(" ; ");
}

const projects: DigestProject[] = act.projects.map((p) => ({
  project: p.project,
  cwd: p.cwd,
  sessions: p.sessions,
  inputTokens: p.inputTokens,
  outputTokens: p.outputTokens,
  cost: p.cost,
  summary: summarize(p.prompts),
}));

const data: DigestData = {
  date: act.date,
  generatedAt: new Date().toISOString().slice(11, 16),
  totals: act.totals,
  projects,
};

const { html, subject, text } = renderDigestEmail(data);
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "previews", "daily-digest-real.html");
writeFileSync(out, html);

console.log("subject:", subject);
console.log(`projects=${projects.length} sessions=${data.totals.sessions} in=${data.totals.inputTokens} out=${data.totals.outputTokens} cost=$${data.totals.cost.toFixed(2)}`);
for (const p of projects) {
  console.log(` - ${p.project.padEnd(28)} ${String(p.sessions).padStart(2)}s  in=${p.inputTokens.toString().padStart(9)} out=${p.outputTokens.toString().padStart(8)}  $${p.cost.toFixed(2)}`);
}

if (process.env.SEND === "1") {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error("SEND=1 but no RESEND_API_KEY"); process.exit(1); }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.REPORT_FROM || "Cockpit <cockpit@elishabjm.cloud>",
      to: process.env.REPORT_TO || "e.bajemon@tw3partners.com",
      subject,
      html,
      text,
    }),
  });
  console.log("resend HTTP", res.status, await res.text());
}
