// Fixed, code owned email template for the daily digest.
// The agent supplies structured data (real numbers come from the server) plus an
// intro and per project narrative; this module renders the HTML so the visual
// style stays consistent and permanent. Resend inspired DA: light, restrained,
// generous whitespace, hairlines, one coral accent used sparingly. Top section
// is an Apple style bento grid of the day's metrics, then a 3 line summary, then
// per project cards. Email safe: nested tables, inline styles, bgcolor for Outlook.

export interface DigestProject {
  readonly project: string;
  readonly cwd: string;
  readonly sessions: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cost: number;
  /** Concrete summary of what was done in this project today (agent written). */
  readonly summary: string;
}

export interface DigestData {
  readonly date: string;
  readonly totals: {
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cost: number;
  };
  readonly projects: readonly DigestProject[];
  /** 3 line overview of the whole day (agent written). */
  readonly intro?: string;
  readonly generatedAt?: string;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

// Palette (Resend-like light DA)
const INK = "#0a0a0a";
const TEXT = "#3a3a3e";
const MUTED = "#787880";
const FAINT = "#a0a0a8";
const BRAND = "#d97757";
const BRAND_TINT = "#fbf1ec";
const BRAND_BORDER = "#f1d9cf";
const PAGE = "#eeeef0";
const CARD = "#ffffff";
const TILE = "#f6f6f7";
const HAIR = "#ebebed";
const HAIR2 = "#f0f0f2";
// Single quoted family names: the style attribute is double quoted.
const FONT = `-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif`;
const MONO = `'SF Mono',ui-monospace,'JetBrains Mono',Menlo,Consolas,monospace`;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmtInt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return fmtInt(n);
}
function fmtCost(n: number): string {
  if (n <= 0) return "$0.00";
  if (n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
function shortCwd(cwd: string): string {
  return cwd.replace(/^\/Users\/[^/]+/, "~").replace(/^\/home\/[^/]+/, "~");
}
function frDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const months = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y}`;
}

// A bento tile. `w` is the column width as a percentage string.
function bento(w: string, label: string, value: string, sub: string, accent: boolean): string {
  const bg = accent ? BRAND_TINT : TILE;
  const border = accent ? BRAND_BORDER : HAIR;
  const valColor = accent ? BRAND : INK;
  return `
  <td width="${w}" valign="top" style="padding:5px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${bg};border:1px solid ${border};border-radius:16px;height:100%;">
      <tr><td style="padding:18px 18px 16px;">
        <div style="font:600 10px/1 ${FONT};color:${accent ? BRAND : FAINT};letter-spacing:0.1em;text-transform:uppercase;">${label}</div>
        <div style="font:700 30px/1.05 ${MONO};color:${valColor};letter-spacing:-0.03em;margin-top:12px;">${value}</div>
        ${sub ? `<div style="font:500 11px/1.4 ${FONT};color:${MUTED};margin-top:7px;">${sub}</div>` : ""}
      </td></tr>
    </table>
  </td>`;
}

function projectCard(p: DigestProject, top: boolean): string {
  const metrics = `${fmtInt(p.sessions)} session${p.sessions > 1 ? "s" : ""}&nbsp;&nbsp;&middot;&nbsp;&nbsp;${fmtTokens(p.inputTokens)} in&nbsp;/&nbsp;${fmtTokens(p.outputTokens)} out`;
  return `
  <tr><td style="padding:6px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${CARD};border:1px solid ${HAIR};border-radius:14px;">
      <tr><td style="padding:18px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="middle">
              <div style="font:650 15px/1.3 ${FONT};color:${INK};letter-spacing:-0.01em;">${esc(p.project)}${top ? ` <span style="font:600 9px/1 ${FONT};color:${BRAND};background:${BRAND_TINT};border:1px solid ${BRAND_BORDER};border-radius:5px;padding:3px 6px;letter-spacing:0.04em;vertical-align:middle;">TOP</span>` : ""}</div>
              <div style="font:500 11px/1.4 ${MONO};color:${FAINT};margin-top:3px;">${esc(shortCwd(p.cwd))}</div>
            </td>
            <td valign="middle" align="right" style="font:700 15px/1.2 ${MONO};color:${INK};white-space:nowrap;padding-left:12px;">${fmtCost(p.cost)}</td>
          </tr>
        </table>
        <div style="font:400 13.5px/1.62 ${FONT};color:${TEXT};margin-top:13px;">${esc(p.summary)}</div>
        <div style="font:500 11px/1.4 ${FONT};color:${FAINT};margin-top:13px;padding-top:12px;border-top:1px solid ${HAIR2};">${metrics}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

function emptyCard(): string {
  return `
  <tr><td style="padding:6px 26px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;background:${CARD};border:1px dashed ${HAIR};border-radius:14px;">
      <tr><td align="center" style="padding:34px 24px;">
        <div style="font:700 19px/1.3 ${FONT};color:${INK};">faignon travaille pas les pieds</div>
        <div style="font:400 13px/1.6 ${FONT};color:${MUTED};margin-top:9px;">Aucune activite enregistree aujourd'hui.<br>Zero session, zero token, zero ligne. Demain on s'y remet.</div>
      </td></tr>
    </table>
  </td></tr>`;
}

export function renderDigestEmail(data: DigestData): RenderedEmail {
  const has = data.projects.length > 0;
  const totalTokens = data.totals.inputTokens + data.totals.outputTokens;
  const top = has ? [...data.projects].sort((a, b) => b.cost - a.cost)[0] : undefined;
  const subject = has
    ? `Digest ${data.date} . ${fmtInt(data.totals.sessions)} sessions . ${fmtCost(data.totals.cost)}`
    : `Digest ${data.date} . rien fait`;
  const preheader = has
    ? `${fmtInt(data.totals.sessions)} sessions, ${data.projects.length} projets, ${fmtTokens(totalTokens)} tokens, ${fmtCost(data.totals.cost)}.`
    : "Rien fait aujourd'hui. faignon travaille pas les pieds.";

  const bentoGrid = has ? `
    <tr><td style="padding:18px 21px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${bento("58%", "Cout du jour", fmtCost(data.totals.cost), `sur ${data.projects.length} projet${data.projects.length > 1 ? "s" : ""} actif${data.projects.length > 1 ? "s" : ""}`, true)}
        ${bento("42%", "Sessions", fmtInt(data.totals.sessions), top ? `top: ${esc(top.project)}` : "", false)}
      </tr></table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        ${bento("50%", "Tokens entree", fmtTokens(data.totals.inputTokens), "contexte consomme", false)}
        ${bento("50%", "Tokens sortie", fmtTokens(data.totals.outputTokens), "genere par les agents", false)}
      </tr></table>
    </td></tr>` : "";

  const introBlock = (data.intro && has) ? `
    <tr><td style="padding:14px 26px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
        <tr><td style="padding:2px 0 0 16px;border-left:3px solid ${BRAND};">
          <div style="font:700 10px/1 ${FONT};color:${FAINT};letter-spacing:0.12em;text-transform:uppercase;">Resume du jour</div>
          <div style="font:400 14px/1.7 ${FONT};color:${TEXT};margin-top:9px;">${esc(data.intro)}</div>
        </td></tr>
      </table>
    </td></tr>` : "";

  const body = has ? data.projects.map((p) => projectCard(p, top ? p.cwd === top.cwd : false)).join("") : emptyCard();

  const html = `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${PAGE};">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${PAGE};border-collapse:collapse;">
  <tr><td align="center" style="padding:30px 14px 40px;">
    <table role="presentation" width="604" cellpadding="0" cellspacing="0" border="0" style="width:604px;max-width:100%;background:${CARD};border-radius:20px;border-collapse:separate;overflow:hidden;box-shadow:0 1px 2px rgba(10,10,10,0.05);">

      <!-- header -->
      <tr><td style="padding:30px 28px 22px;border-bottom:1px solid ${HAIR};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="middle">
            <div style="font:650 13px/1 ${FONT};color:${INK};letter-spacing:-0.01em;">
              <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${BRAND};margin-right:8px;"></span>Cockpit
            </div>
            <div style="font:700 25px/1.15 ${FONT};color:${INK};letter-spacing:-0.025em;margin-top:16px;">Digest quotidien</div>
          </td>
          <td valign="bottom" align="right" style="font:500 12px/1.5 ${FONT};color:${MUTED};white-space:nowrap;">${frDate(data.date)}</td>
        </tr></table>
      </td></tr>

      ${bentoGrid}
      ${introBlock}

      <!-- section label -->
      <tr><td style="padding:${has ? "20" : "16"}px 28px 4px;">
        <div style="font:700 10px/1 ${FONT};color:${FAINT};letter-spacing:0.12em;text-transform:uppercase;">${has ? `Par projet (${data.projects.length})` : "Aujourd'hui"}</div>
      </td></tr>

      ${body}

      <!-- footer -->
      <tr><td style="padding:24px 28px 28px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${HAIR};padding-top:18px;">
          <div style="font:600 11px/1 ${FONT};color:${MUTED};">
            <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${BRAND};margin-right:6px;"></span>Cockpit${data.generatedAt ? ` <span style="color:${FAINT};font-weight:500;">&middot; ${esc(data.generatedAt)}</span>` : ""}
          </div>
          <div style="font:400 11px/1.6 ${FONT};color:${FAINT};margin-top:8px;">Genere depuis vos transcripts locaux Claude Code.</div>
        </td></tr></table>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject, html, text: renderText(data) };
}

function renderText(data: DigestData): string {
  const lines: string[] = [];
  lines.push(`COCKPIT . Digest quotidien . ${frDate(data.date)}`);
  lines.push("");
  if (data.projects.length === 0) {
    lines.push("faignon travaille pas les pieds.");
    return lines.join("\n");
  }
  lines.push(`${fmtInt(data.totals.sessions)} sessions . ${data.projects.length} projets . ${fmtTokens(data.totals.inputTokens)} in / ${fmtTokens(data.totals.outputTokens)} out . ${fmtCost(data.totals.cost)}`);
  if (data.intro) { lines.push(""); lines.push(data.intro); }
  lines.push("");
  for (const p of data.projects) {
    lines.push(`# ${p.project} (${shortCwd(p.cwd)}) . ${fmtCost(p.cost)}`);
    lines.push(`  ${p.summary}`);
    lines.push(`  ${fmtInt(p.sessions)} sessions . ${fmtTokens(p.inputTokens)} in / ${fmtTokens(p.outputTokens)} out`);
    lines.push("");
  }
  return lines.join("\n");
}

// Sample payload used by previews/tests when real data is not wired.
export const SAMPLE_DIGEST: DigestData = {
  date: "2026-05-29",
  generatedAt: "17:00",
  intro: "Journee dense cote infra: la gestion de secrets chiffres et le cron de digest ont avance de la conception au build. En parallele, du contenu GEO a ete produit sur DataGeo et quelques correctifs front sur le site perso. Le gros du cout vient des sessions opus longues sur cockpit.",
  totals: { sessions: 14, inputTokens: 2_840_000, outputTokens: 196_400, cost: 7.83 },
  projects: [
    { project: "slave (cockpit)", cwd: "/Users/elishabajemontw3/Documents/projetspersos/slave", sessions: 6, inputTokens: 1_910_000, outputTokens: 121_000, cost: 4.92, summary: "Conception et debut d'implementation de la gestion de secrets (AES-256-GCM) et du cron de digest quotidien, avec un template d'email dedie et la correction d'un bug de fuseau horaire du scheduler." },
    { project: "datageo", cwd: "/Users/elishabajemontw3/Documents/projetspersos/datageo", sessions: 5, inputTokens: 640_000, outputTokens: 52_000, cost: 2.11, summary: "Reecriture GEO de trois articles, scoring complet d'une page produit et import d'un sitemap de 42 URLs." },
    { project: "perso-site", cwd: "/Users/elishabajemontw3/Documents/perso/site", sessions: 3, inputTokens: 290_000, outputTokens: 23_400, cost: 0.80, summary: "Refonte de la page d'accueil, integration du dark mode et correction de deux bugs d'hydratation Next.js." },
  ],
};
