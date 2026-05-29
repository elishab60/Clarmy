import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "@/lib/util/logger";
import type { QuotaWindow } from "@/lib/shared/quota";

const log = createLogger("quota/claude-usage");

// Same endpoint the CLI `/usage` screen reads: real server-side utilization for
// the rolling 5h session window and the 7-day windows. The OAuth access token is
// read from the shared credentials file at call time (the CLI keeps it fresh)
// and used only as a Bearer header; it is never logged.
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

interface UsageWindowRaw { utilization?: unknown; resets_at?: unknown }
interface UsageResp {
  five_hour?: UsageWindowRaw | null;
  seven_day?: UsageWindowRaw | null;
  seven_day_opus?: UsageWindowRaw | null;
  seven_day_sonnet?: UsageWindowRaw | null;
}

function readToken(): string | null {
  try {
    const j = JSON.parse(
      readFileSync(resolve(homedir(), ".claude", ".credentials.json"), "utf8"),
    ) as { claudeAiOauth?: { accessToken?: unknown } };
    const t = j.claudeAiOauth?.accessToken;
    return typeof t === "string" && t ? t : null;
  } catch { return null; }
}

function toWindow(
  label: string,
  minutes: number,
  raw: UsageWindowRaw | null | undefined,
  includeZero: boolean,
): QuotaWindow | null {
  if (!raw) return null;
  const u = raw.utilization;
  if (typeof u !== "number" || !Number.isFinite(u)) return null;
  if (!includeZero && u <= 0) return null;
  const reset = typeof raw.resets_at === "string" ? Date.parse(raw.resets_at) : NaN;
  return {
    label,
    usedPercent: Math.min(100, Math.max(0, u)),
    windowMinutes: minutes,
    resetsAt: Number.isNaN(reset) ? null : reset,
  };
}

// Returns the live usage windows, or null when the token is missing / the call
// fails / the shape is unusable, so the caller can fall back to a local estimate.
export async function fetchClaudeUsageWindows(): Promise<QuotaWindow[] | null> {
  const token = readToken();
  if (!token) return null;

  let resp: Response;
  try {
    resp = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": "2023-06-01",
        Accept: "application/json",
        "User-Agent": "cockpit-quota",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    log.warn("usage fetch failed", { err: String(err) });
    return null;
  }
  if (!resp.ok) {
    log.warn("usage non-ok", { status: resp.status });
    return null;
  }

  let data: UsageResp;
  try { data = (await resp.json()) as UsageResp; }
  catch { return null; }

  const windows: QuotaWindow[] = [];
  const five = toWindow("5h", 300, data.five_hour, true);
  const week = toWindow("Wk", 10080, data.seven_day, true);
  const opus = toWindow("Opus", 10080, data.seven_day_opus, false);
  const sonnet = toWindow("Sonnet", 10080, data.seven_day_sonnet, false);
  if (five) windows.push(five);
  if (week) windows.push(week);
  if (opus) windows.push(opus);
  if (sonnet) windows.push(sonnet);

  return windows.length > 0 ? windows : null;
}
