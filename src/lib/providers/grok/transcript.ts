import { readFileSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { join } from "node:path";
import { grokHome, SUMMARY_FILE, EVENTS_FILE, UPDATES_FILE } from "./paths.ts";

function parseTs(s: string | undefined): number {
  if (!s) return 0;
  const t = Date.parse(s);
  return Number.isNaN(t) ? 0 : t;
}

// ---- summary.json -------------------------------------------------------

export interface GrokSummary {
  readonly id: string;
  readonly cwd?: string;
  readonly createdAt: number;
  readonly endedAt: number;
  readonly messageCount: number;
  readonly model?: string;
  readonly title?: string;
}

interface RawSummary {
  info?: { id?: string; cwd?: string };
  created_at?: string;
  updated_at?: string;
  last_active_at?: string;
  num_messages?: number;
  num_chat_messages?: number;
  current_model_id?: string;
  generated_title?: string;
  session_summary?: string;
}

export function readSummary(dir: string): GrokSummary | null {
  let raw: RawSummary;
  try { raw = JSON.parse(readFileSync(join(dir, SUMMARY_FILE), "utf8")) as RawSummary; }
  catch { return null; }
  const id = raw.info?.id;
  if (!id) return null;
  const ended = parseTs(raw.last_active_at) || parseTs(raw.updated_at);
  return {
    id,
    cwd: raw.info?.cwd,
    createdAt: parseTs(raw.created_at),
    endedAt: ended,
    messageCount: raw.num_chat_messages ?? raw.num_messages ?? 0,
    model: raw.current_model_id,
    title: raw.generated_title ?? raw.session_summary,
  };
}

// ---- events.jsonl -------------------------------------------------------

export interface GrokEventStats {
  readonly toolUses: number;
  readonly lastTool: string | null;
  readonly model: string | null;
  readonly lastTs: number;
}

interface RawEvent { ts?: string; type?: string; tool_name?: string; model_id?: string }

// Cheap scan of events.jsonl: counts tool_started, tracks the last tool name and
// the model id from turn_started. Lines that cannot carry those fields are
// skipped before JSON.parse (events.jsonl is dominated by phase_changed noise).
export function readEventStats(dir: string): GrokEventStats {
  let toolUses = 0;
  let lastTool: string | null = null;
  let model: string | null = null;
  let lastTs = 0;
  let text: string;
  try { text = readFileSync(join(dir, EVENTS_FILE), "utf8"); } catch {
    return { toolUses, lastTool, model, lastTs };
  }
  for (const line of text.split("\n")) {
    if (!line) continue;
    const wantsTool = line.includes("tool_started");
    const wantsTurn = line.includes("turn_started");
    if (!wantsTool && !wantsTurn) continue;
    let e: RawEvent;
    try { e = JSON.parse(line) as RawEvent; } catch { continue; }
    const ts = parseTs(e.ts);
    if (ts > lastTs) lastTs = ts;
    if (e.type === "tool_started") {
      toolUses++;
      if (e.tool_name) lastTool = e.tool_name;
    } else if (e.type === "turn_started" && e.model_id) {
      model = e.model_id;
    }
  }
  return { toolUses, lastTool, model, lastTs };
}

// ---- updates.jsonl ------------------------------------------------------

// Latest cumulative context-token count (Grok writes `_meta.totalTokens` on its
// agent chunks). Reads only the file tail so a multi-MB transcript stays cheap to
// poll. Returns null when no count is present yet.
export function readContextTokens(dir: string): number | null {
  const file = join(dir, UPDATES_FILE);
  let size: number;
  let fd: number;
  try { size = statSync(file).size; fd = openSync(file, "r"); } catch { return null; }
  try {
    const want = Math.min(size, 65_536);
    if (want <= 0) return null;
    const buf = Buffer.allocUnsafe(want);
    readSync(fd, buf, 0, want, size - want);
    const text = buf.toString("utf8");
    const re = /"totalTokens":(\d+)/g;
    let last: number | null = null;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) last = Number(m[1]);
    }
    return last;
  } finally { closeSync(fd); }
}

// ---- active_sessions.json ----------------------------------------------

interface RawActive { session_id?: string }

// Session ids Grok currently has open (its "leader" tracks these in
// ~/.grok/active_sessions.json). Used to mark a scanned session as ongoing.
export function activeSessionIds(): Set<string> {
  try {
    const raw = JSON.parse(readFileSync(join(grokHome(), "active_sessions.json"), "utf8")) as unknown;
    if (Array.isArray(raw)) {
      return new Set(
        raw
          .map((r) => (r && typeof r === "object" ? (r as RawActive).session_id : undefined))
          .filter((x): x is string => !!x),
      );
    }
  } catch { /* absent or unreadable */ }
  return new Set();
}
