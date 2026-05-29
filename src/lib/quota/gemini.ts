import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "@/lib/util/logger";
import type { ProviderQuota } from "@/lib/shared/quota";

const log = createLogger("quota/gemini");

// Gemini exposes no consumer usage endpoint. Local usage exists only if the user
// opts into Gemini CLI OpenTelemetry (.gemini/telemetry.log emitting
// `gemini_cli.api.request.count`). When absent we render a clean stub so the
// gauge stays empty with a hint rather than faking 0%.
const DEFAULT_RPD = 250; // Gemini 2.5 Flash free-tier requests/day.

function telemetryLog(): string | null {
  const candidates = [
    resolve(process.cwd(), ".gemini", "telemetry.log"),
    resolve(homedir(), ".gemini", "telemetry.log"),
  ];
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; }
    catch { /* next candidate */ }
  }
  return null;
}

function todayKey(): string {
  // Free-tier quota resets at midnight America/Los_Angeles.
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function nextPacificMidnight(): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  // Approximate next reset for the countdown; exact TZ offset is not critical here.
  const todayLA = Date.parse(`${get("year")}-${get("month")}-${get("day")}T00:00:00-08:00`);
  return todayLA + 24 * 3_600_000;
}

function stub(state: "unconfigured" | "unknown", detail: string): ProviderQuota {
  return {
    provider: "gemini", label: "Gemini", state, plan: null,
    usedPercent: null, windows: [], detail, source: "stub", asOf: null,
  };
}

export function getGeminiQuota(): ProviderQuota {
  const logPath = telemetryLog();
  if (!logPath) return stub("unconfigured", "enable Gemini CLI telemetry");

  let text: string;
  try { text = readFileSync(logPath, "utf8"); }
  catch (err) {
    log.warn("telemetry unreadable", { err: String(err) });
    return stub("unknown", "telemetry unreadable");
  }

  // Best-effort: the log format is unspecified, so count request-metric markers
  // dated today. Any parse shortfall degrades to an honest unknown.
  const day = todayKey();
  let used = 0;
  for (const line of text.split("\n")) {
    if (!line.includes("gemini_cli.api.request.count")) continue;
    if (line.includes(day)) used++;
  }
  if (used === 0) return stub("unknown", "no Gemini requests today");

  const limit = DEFAULT_RPD;
  const pct = Math.min(100, Math.max(0, (used / limit) * 100));
  return {
    provider: "gemini",
    label: "Gemini",
    state: "ok",
    plan: "Free",
    usedPercent: pct,
    windows: [{ label: "Day", usedPercent: pct, windowMinutes: 1440, resetsAt: nextPacificMidnight() }],
    detail: `${used} / ${limit} req`,
    source: "telemetry-log",
    asOf: Date.now(),
  };
}
