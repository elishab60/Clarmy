import { readdirSync, readFileSync, statSync, type Dirent } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../util/logger.ts";
import type { ProviderQuota, QuotaWindow } from "../shared/quota.ts";

const log = createLogger("quota/codex");

// Codex CLI persists the server-computed rate-limit gauge directly into each
// session rollout JSONL as a `token_count` event. We read the latest non-null
// reading instead of estimating: Codex already did the math.
function codexHome(): string {
  return process.env.CODEX_HOME || resolve(homedir(), ".codex");
}

interface FileEntry { readonly path: string; readonly mtime: number; }

function collectSessionFiles(dir: string, out: FileEntry[], depth = 0): void {
  if (depth > 5) return;
  let entries: Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) collectSessionFiles(full, out, depth + 1);
    else if (ent.isFile() && ent.name.endsWith(".jsonl")) {
      try { out.push({ path: full, mtime: statSync(full).mtimeMs }); }
      catch { /* skip unreadable */ }
    }
  }
}

interface RateWindowRaw { used_percent?: unknown; window_minutes?: unknown; resets_at?: unknown; }
interface RateLimitsRaw { primary?: RateWindowRaw | null; secondary?: RateWindowRaw | null; plan_type?: unknown; }

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function toWindow(label: string, raw: RateWindowRaw | null | undefined, now: number): QuotaWindow | null {
  if (!raw) return null;
  const used = num(raw.used_percent);
  if (used === null) return null;
  const resetsSec = num(raw.resets_at);
  const resetsAt = resetsSec !== null ? resetsSec * 1000 : null;
  // Past reset means the window already rolled over: treat as freshly empty.
  const usedPercent = resetsAt !== null && resetsAt < now ? 0 : Math.min(100, Math.max(0, used));
  const windowMinutes = num(raw.window_minutes) ?? 0;
  return { label, usedPercent, windowMinutes, resetsAt };
}

function stub(state: "unconfigured" | "unknown", detail: string): ProviderQuota {
  return {
    provider: "codex", label: "Codex", state, plan: null,
    usedPercent: null, windows: [], detail, source: "stub", asOf: null,
  };
}

export function getCodexQuota(): ProviderQuota {
  const home = codexHome();
  const sessionsDir = join(home, "sessions");
  try { if (!statSync(sessionsDir).isDirectory()) return stub("unconfigured", "Codex not detected"); }
  catch { return stub("unconfigured", "Codex not detected"); }

  const files: FileEntry[] = [];
  collectSessionFiles(sessionsDir, files);
  if (files.length === 0) return stub("unknown", "no Codex sessions");

  const newest = files.sort((a, b) => b.mtime - a.mtime).slice(0, 12);
  const now = Date.now();

  let bestTs = 0;
  let bestRate: RateLimitsRaw | null = null;
  for (const f of newest) {
    let text: string;
    try { text = readFileSync(f.path, "utf8"); }
    catch { continue; }
    for (const raw of text.split("\n")) {
      if (!raw.includes("\"token_count\"") || !raw.includes("rate_limits")) continue;
      let rec: { timestamp?: unknown; payload?: { type?: unknown; rate_limits?: RateLimitsRaw | null } };
      try { rec = JSON.parse(raw); }
      catch { continue; }
      const rl = rec.payload?.rate_limits;
      if (rec.payload?.type !== "token_count" || !rl) continue;
      if (!rl.primary && !rl.secondary) continue;
      const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : NaN;
      const tsMs = Number.isNaN(ts) ? f.mtime : ts;
      if (tsMs >= bestTs) { bestTs = tsMs; bestRate = rl; }
    }
  }

  if (!bestRate) return stub("unknown", "no Codex usage data");

  const windows: QuotaWindow[] = [];
  const primary = toWindow("5h", bestRate.primary, now);
  const secondary = toWindow("Weekly", bestRate.secondary, now);
  if (primary) windows.push(primary);
  if (secondary) windows.push(secondary);
  if (windows.length === 0) return stub("unknown", "no Codex usage data");

  const headline = windows.reduce((m, w) => Math.max(m, w.usedPercent), 0);
  const plan = typeof bestRate.plan_type === "string" && bestRate.plan_type
    ? bestRate.plan_type.charAt(0).toUpperCase() + bestRate.plan_type.slice(1)
    : null;
  const parts = windows.map((w) => `${w.label} ${Math.round(w.usedPercent)}%`);

  log.debug("codex reading", { headline, windows: windows.length });
  return {
    provider: "codex",
    label: "Codex",
    state: "ok",
    plan,
    usedPercent: headline,
    windows,
    detail: parts.join(" · "),
    source: "codex-session-log",
    asOf: bestTs || null,
  };
}
