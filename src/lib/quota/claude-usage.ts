import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../util/logger.ts";
import type { QuotaWindow } from "../shared/quota.ts";

const log = createLogger("quota/claude-usage");

// Same endpoint the CLI `/usage` screen reads: real server-side utilization for
// the rolling 5h session window and the 7-day windows. The OAuth access token is
// read from the shared credentials file at call time (the CLI keeps it fresh)
// and used only as a Bearer header; it is never logged.
const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

// The endpoint buckets its rate limit by User-Agent: anything that is not the
// official client lands in an aggressively throttled bucket and gets near
// permanent 429s, which silently forces the caller down to the local cost
// estimate (wrong numbers, a lone 5h window, no real reset times). Sending the
// claude-code UA (the bucket keys on the "claude-code/" prefix) gets the
// generous limit so the real five_hour + seven_day windows come through.
// Override the version with COCKPIT_CLAUDE_USAGE_UA if it ever drifts.
const USAGE_USER_AGENT = process.env.COCKPIT_CLAUDE_USAGE_UA || "claude-code/2.1.156";

interface UsageWindowRaw { utilization?: unknown; resets_at?: unknown }
interface UsageResp {
  five_hour?: UsageWindowRaw | null;
  seven_day?: UsageWindowRaw | null;
  seven_day_opus?: UsageWindowRaw | null;
  seven_day_sonnet?: UsageWindowRaw | null;
}

function pickToken(raw: string): string | null {
  const j = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown } };
  const t = j.claudeAiOauth?.accessToken;
  return typeof t === "string" && t ? t : null;
}

// On macOS the CLI keeps the live, auto-refreshed OAuth token in the login
// Keychain (service "Claude Code-credentials"); the ~/.claude/.credentials.json
// file is a stale legacy copy that can sit expired for days. Read the Keychain
// first there so we send a valid token instead of a dead one (which the usage
// endpoint answers with a misleading 429). First access may prompt the user to
// allow the keychain item once.
function readTokenFromKeychain(): string | null {
  if (process.platform !== "darwin") return null;
  try {
    const raw = execFileSync(
      "security",
      ["find-generic-password", "-s", "Claude Code-credentials", "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return pickToken(raw.trim());
  } catch { return null; }
}

function readTokenFromFile(): string | null {
  try {
    return pickToken(readFileSync(resolve(homedir(), ".claude", ".credentials.json"), "utf8"));
  } catch { return null; }
}

function readToken(): string | null {
  return readTokenFromKeychain() ?? readTokenFromFile();
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

function buildWindows(data: UsageResp): QuotaWindow[] {
  const windows: QuotaWindow[] = [];
  const five = toWindow("5h", 300, data.five_hour, true);
  const week = toWindow("Weekly", 10080, data.seven_day, true);
  const opus = toWindow("Opus", 10080, data.seven_day_opus, false);
  const sonnet = toWindow("Sonnet", 10080, data.seven_day_sonnet, false);
  if (five) windows.push(five);
  if (week) windows.push(week);
  if (opus) windows.push(opus);
  if (sonnet) windows.push(sonnet);
  return windows;
}

// The /api/oauth/usage endpoint is itself rate limited, so hitting it on every
// 15s client poll returns 429. Cache the result: refresh upstream at most once a
// minute, and on any failure (429, network, expired token) keep serving the last
// good reading for up to an hour before giving up and letting the caller fall
// back to a local estimate.
let cache: { windows: QuotaWindow[]; at: number } | null = null;
let nextTryAt = 0;
const FRESH_MS = 60_000;
const STALE_OK_MS = 60 * 60_000;
const BACKOFF_MS = 5 * 60_000;
// Cold start (no cached reading yet) retries soon so a single transient 429 does
// not strand the gauge with no data for five minutes. Once we have a reading we
// can serve it stale, so a longer backoff is fine.
const COLD_BACKOFF_MS = 30_000;

function scheduleRetry(now: number): void {
  nextTryAt = now + (cache ? BACKOFF_MS : COLD_BACKOFF_MS);
}

function serveStale(now: number): QuotaWindow[] | null {
  return cache && now - cache.at < STALE_OK_MS ? cache.windows : null;
}

// Returns the live usage windows (possibly from cache), or null when nothing
// usable is available so the caller can fall back to a local estimate.
export async function fetchClaudeUsageWindows(): Promise<QuotaWindow[] | null> {
  const now = Date.now();
  if (cache && now - cache.at < FRESH_MS) return cache.windows;
  if (now < nextTryAt) return serveStale(now);

  const token = readToken();
  if (!token) return serveStale(now);

  let resp: Response;
  try {
    resp = await fetch(USAGE_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "anthropic-version": "2023-06-01",
        Accept: "application/json",
        "User-Agent": USAGE_USER_AGENT,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    log.warn("usage fetch failed", { err: String(err) });
    scheduleRetry(now);
    return serveStale(now);
  }
  if (!resp.ok) {
    log.warn("usage non-ok", { status: resp.status });
    scheduleRetry(now);
    return serveStale(now);
  }

  let data: UsageResp;
  try { data = (await resp.json()) as UsageResp; }
  catch { scheduleRetry(now); return serveStale(now); }

  const windows = buildWindows(data);
  if (windows.length > 0) {
    cache = { windows, at: now };
    nextTryAt = 0;
    return windows;
  }
  scheduleRetry(now);
  return serveStale(now);
}
