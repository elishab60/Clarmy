import { readFileSync, openSync, readSync, closeSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ProviderUsageRecord } from "../types.ts";
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

// ---- usage reconstruction (updates.jsonl) -------------------------------

// Grok records no billed token counts (no input/output/cache like Claude). The
// only token signal is `_meta.totalTokens`: the cumulative context size sampled
// on each streamed chunk. Each model call within a turn is identified by a
// distinct `_meta.streamStartMs`, and the totalTokens at the start of a stream is
// the context that call was fed. We reconstruct billed usage from that, modelling
// the resent context prefix as cache reads (prompt caching) exactly like the
// Codex scanner splits cached_input_tokens out of input_tokens:
//   - input  = the growth of context over the running peak (genuinely new tokens)
//   - cache  = the rest of the context the call re-read
//   - output = a /4 char estimate of the assistant text + reasoning it generated
// Output undercounts tool-call arguments (not emitted as text), but for these
// long-context agentic sessions input dwarfs output, so cost is driven by input.

interface RawUpdateLine {
  params?: {
    _meta?: { streamStartMs?: number; totalTokens?: number };
    update?: {
      sessionUpdate?: string;
      content?: { type?: string; text?: string };
      _meta?: { modelId?: string };
    };
  };
}

interface StreamAcc {
  firstTokens: number | null;
  lastTokens: number | null;
  outChars: number;
  model: string | undefined;
}

const TOKENS_PER_CHAR = 1 / 4;

export function readUsageRecords(
  dir: string,
  sessionId: string,
  defaultModel: string | undefined,
): ProviderUsageRecord[] {
  let text: string;
  try { text = readFileSync(join(dir, UPDATES_FILE), "utf8"); } catch { return []; }

  // Group chunks by model-call stream, preserving chronological (insertion) order.
  const streams = new Map<number, StreamAcc>();
  for (const line of text.split("\n")) {
    if (!line || !line.includes("streamStartMs")) continue;
    let o: RawUpdateLine;
    try { o = JSON.parse(line) as RawUpdateLine; } catch { continue; }
    const meta = o.params?._meta;
    if (!meta || typeof meta.streamStartMs !== "number") continue;
    const ss = meta.streamStartMs;
    let acc = streams.get(ss);
    if (!acc) { acc = { firstTokens: null, lastTokens: null, outChars: 0, model: defaultModel }; streams.set(ss, acc); }
    const tt = meta.totalTokens;
    if (typeof tt === "number") {
      if (acc.firstTokens === null) acc.firstTokens = tt;
      acc.lastTokens = tt;
    }
    const u = o.params?.update;
    const su = u?.sessionUpdate;
    if ((su === "agent_message_chunk" || su === "agent_thought_chunk") && u?.content?.type === "text") {
      acc.outChars += u.content.text?.length ?? 0;
    }
    const mid = u?._meta?.modelId;
    if (typeof mid === "string") acc.model = mid;
  }

  const out: ProviderUsageRecord[] = [];
  let peak = 0;
  for (const [ss, acc] of streams) {
    const ctxStart = acc.firstTokens ?? acc.lastTokens ?? 0;
    const input = Math.max(0, ctxStart - peak); // genuinely new context tokens
    const cacheRead = ctxStart - input; // re-read prefix (= min(ctxStart, peak))
    const output = Math.round(acc.outChars * TOKENS_PER_CHAR);
    const top = Math.max(ctxStart, acc.lastTokens ?? 0);
    if (top > peak) peak = top;
    if (input === 0 && cacheRead === 0 && output === 0) continue;
    out.push({
      key: `${sessionId}:${ss}`,
      ts: ss,
      model: acc.model,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheCreate5mTokens: 0,
      cacheCreate1hTokens: 0,
    });
  }
  return out;
}

// Freshest content timestamp for a session dir, for mtime-cached re-scans.
// summary.json is rewritten on every update (its updated_at advances), so its
// mtime tracks activity even when only files inside the dir are appended (a
// macOS dir mtime does not change on in-place file growth).
export function contentMtime(dir: string): number {
  for (const f of [SIGNALS_FILE, SUMMARY_FILE, UPDATES_FILE]) {
    try { return statSync(join(dir, f)).mtimeMs; } catch { /* try next */ }
  }
  return 0;
}

// ---- signals.json (the /usage aggregates) -------------------------------

const SIGNALS_FILE = "signals.json";

export interface GrokSignals {
  readonly toolUses: number;
  readonly contextTokens: number;
  readonly contextWindow: number;
  readonly model?: string;
}

interface RawSignals {
  toolCallCount?: number;
  contextTokensUsed?: number;
  contextWindowTokens?: number;
  modelsUsed?: string[];
  primaryModelId?: string;
}

// Per-session aggregates Grok keeps for its `/usage` view: real tool-call count,
// current context size and window, and the model(s) used. Tiny file, cheap to
// read, exact (no estimation).
export function readSignals(dir: string): GrokSignals | null {
  let raw: RawSignals;
  try { raw = JSON.parse(readFileSync(join(dir, SIGNALS_FILE), "utf8")) as RawSignals; }
  catch { return null; }
  return {
    toolUses: raw.toolCallCount ?? 0,
    contextTokens: raw.contextTokensUsed ?? 0,
    contextWindow: raw.contextWindowTokens ?? 0,
    model: raw.primaryModelId ?? raw.modelsUsed?.[0],
  };
}

// ---- billed token usage (logs/unified.jsonl) ----------------------------

interface RawUnified {
  sid?: string;
  ts?: string;
  msg?: string;
  ctx?: {
    loop_index?: number;
    prompt_tokens?: number;
    cached_prompt_tokens?: number;
    completion_tokens?: number;
  };
}

// The real, billed per-call token counts, identical to what `/usage` reports.
// Grok logs every model call as a `shell.turn.inference_done` line in the GLOBAL
// rolling log ~/.grok/logs/unified.jsonl. We read it once and group records by
// session id. The log rotates, so very old sessions may be absent (callers fall
// back to the context-size reconstruction in readUsageRecords).
//   - input  = prompt_tokens - cached_prompt_tokens   (uncached prompt)
//   - cache  = cached_prompt_tokens                    (prompt-cache reads)
//   - output = completion_tokens                       (incl. reasoning tokens)
export function readUnifiedUsage(): Map<string, ProviderUsageRecord[]> {
  const out = new Map<string, ProviderUsageRecord[]>();
  let text: string;
  try { text = readFileSync(join(grokHome(), "logs", "unified.jsonl"), "utf8"); }
  catch { return out; }
  for (const line of text.split("\n")) {
    if (!line || !line.includes("inference_done")) continue;
    let o: RawUnified;
    try { o = JSON.parse(line) as RawUnified; } catch { continue; }
    if (o.msg !== "shell.turn.inference_done" || !o.sid || !o.ctx) continue;
    const c = o.ctx;
    const prompt = c.prompt_tokens ?? 0;
    const cached = c.cached_prompt_tokens ?? 0;
    const output = c.completion_tokens ?? 0;
    if (prompt === 0 && output === 0) continue;
    const ts = parseTs(o.ts);
    const rec: ProviderUsageRecord = {
      key: `${o.sid}:${ts}:${c.loop_index ?? 0}`,
      ts,
      model: undefined, // priced against the session's model in metrics-rows
      inputTokens: Math.max(0, prompt - cached),
      outputTokens: output,
      cacheReadTokens: cached,
      cacheCreate5mTokens: 0,
      cacheCreate1hTokens: 0,
    };
    const list = out.get(o.sid);
    if (list) list.push(rec); else out.set(o.sid, [rec]);
  }
  return out;
}
