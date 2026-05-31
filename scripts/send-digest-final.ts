// Renders the digest from REAL numbers (buildDailyActivity) + real per-project
// narratives (gathered by reading the transcripts) + a 3 line intro, using the
// current bento template, then optionally sends via Resend.
// SEND=1 RESEND_API_KEY=.. node --experimental-transform-types scripts/send-digest-final.ts [date]
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildDailyActivity } from "../src/lib/claude-code/daily-activity.ts";
import { renderDigestEmail, type DigestData, type DigestProject } from "../src/lib/claude-code/email-template.ts";

const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const act = buildDailyActivity(date);

const intro =
  "Journee tres dense, dominee par l'infra Cockpit: la gestion de secrets chiffree et le cron de digest quotidien sont passes de la conception au build, en plus du support Opus 4.8, de la dockerisation et de la refonte Metrics. En parallele, gros travail editorial GEO sur DataGeo (5 articles fact-checkes puis publies en brouillon) et un fine-tuning guardrail V2 qui gagne +0,116 de macro_f1. Le cout du jour vient surtout des longues sessions opus sur cockpit et ses worktrees.";

const SUMMARIES: Record<string, string> = {
  "/Users/elishabajemontw3/Documents/projetspersos/slave":
    "Construction de la gestion de secrets chiffree (AES-256-GCM) et du cron de digest quotidien: template email bento, outils MCP get_daily_activity et send_digest_email. Aussi support Opus 4.8 et effort ultracode, dockerisation en 2 conteneurs avec sessions persistantes, et refonte de la page Metrics et des jauges de quota.",
  "/Users/elishabajemontw3/Documents/DATAGEO":
    "Audit editorial et fact-check de 5 articles GEO/SEO (AI Act, NIS2, RGPD, SecNumCloud), corrections appliquees via MCP, puis publication des 5 versions HTML finales en brouillon WordPress sur tw3partners.fr.",
  "/Users/elishabajemontw3/Documents/projetspersos/slave-multiprovider":
    "Couche d'abstraction multi-provider mergee sur main: drivers et parseurs de transcript dedies pour piloter Gemini et Codex a cote de Claude, onglets et metriques par provider, build de prod au vert.",
  "/Users/elishabajemontw3/Documents/projetspersos/slave-quota":
    "Section Quotas temps reel dans la sidebar (jauges Claude/Codex/Gemini via /api/quotas), avec cache serveur 60s et backoff sur les 429 pour stopper le quota qui sautait. Mergee sur main.",
  "/Users/elishabajemontw3/Documents/guardrail_project":
    "Generation du dataset synthetique v8 puis fine-tuning local (mDeBERTa-v3, 5 seeds) du modele guardrail V7.1 V2: macro_f1 moyen 0,92 (+0,116 vs prod). Une variante V3 s'est revelee regressive et a ete abandonnee.",
  "/Users/elishabajemontw3/Documents/projetspersos/slave-mcp":
    "Conception et finalisation du serveur MCP de cockpit (design doc + prototype: bus inter-sessions, dispatch JSON-RPC, 10 outils, auto-injection par session), durci par une revue adversariale.",
  "/Users/elishabajemontw3":
    "Nettoyage du stockage Mac: environ 300 Go liberes (caches de build et Docker, seeds ML redondants, modeles Ollama, cache HuggingFace), bases de donnees et backbone d'entrainement preserves.",
  "/Users/elishabajemontw3/Documents/projetspersos/street_gooners":
    "Recherche d'un connecteur type Codex pour Gemini CLI afin d'exploiter la generation d'images nano banana de Google.",
  "/app":
    "Sessions de test de connectivite (SANDBOX_OK, PROD_OK, hello) et une session echouee faute d'authentification.",
};

const projects: DigestProject[] = act.projects.map((p) => ({
  project: p.project,
  cwd: p.cwd,
  sessions: p.sessions,
  inputTokens: p.inputTokens,
  outputTokens: p.outputTokens,
  cost: p.cost,
  summary: SUMMARIES[p.cwd] ?? "Activite enregistree.",
}));

const data: DigestData = {
  date: act.date,
  generatedAt: new Date().toISOString().slice(11, 16),
  totals: act.totals,
  projects,
  intro,
};

const { html, subject, text } = renderDigestEmail(data);
const here = dirname(fileURLToPath(import.meta.url));
writeFileSync(join(here, "..", "previews", "daily-digest-real.html"), html);
console.log("subject:", subject);
console.log(`projects=${projects.length} sessions=${data.totals.sessions} cost=$${data.totals.cost.toFixed(2)}`);

if (process.env.SEND === "1") {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.error("no RESEND_API_KEY"); process.exit(1); }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.REPORT_FROM || "Cockpit <cockpit@elishabjm.cloud>",
      to: process.env.REPORT_TO || "e.bajemon@tw3partners.com",
      subject, html, text,
    }),
  });
  console.log("resend HTTP", res.status, await res.text());
}
