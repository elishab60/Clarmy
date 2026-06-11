import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { settingsPath } from "./paths.ts";

// Claude Code prunes transcripts after `cleanupPeriodDays` (default 30 when
// the key is absent). Everything CLARMY shows (history, metrics, cost) is
// built from those transcripts, so the default silently erodes the data.
// "Persistent" here means a retention so long it is effectively forever.

export const DEFAULT_CLEANUP_DAYS = 30;
export const PERSISTENT_DAYS = 36_500;          // 100 years
const PERSISTENT_THRESHOLD = 3_650;             // >= 10 years counts as persistent

export interface RetentionState {
  readonly cleanupPeriodDays: number;
  readonly persistent: boolean;
}

type Settings = { cleanupPeriodDays?: unknown; [k: string]: unknown };

function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsPath(), "utf8")) as Settings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

export function readRetention(): RetentionState {
  const s = readSettings();
  const raw = s.cleanupPeriodDays;
  const days = typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_CLEANUP_DAYS;
  return { cleanupPeriodDays: days, persistent: days >= PERSISTENT_THRESHOLD };
}

// Sets cleanupPeriodDays to the persistent value, preserving every other key.
// Atomic write (tmp + rename), same pattern as mcp-config.
export function makeHistoryPersistent(): RetentionState {
  const s = readSettings();
  s.cleanupPeriodDays = PERSISTENT_DAYS;
  const tmp = settingsPath() + ".cockpit.tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", "utf8");
  renameSync(tmp, settingsPath());
  return { cleanupPeriodDays: PERSISTENT_DAYS, persistent: true };
}
