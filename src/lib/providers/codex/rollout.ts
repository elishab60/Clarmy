// Parsing for OpenAI Codex CLI "rollout" transcripts: line-delimited JSON under
// ~/.codex/sessions/<YYYY>/<MM>/<DD>/rollout-<ts>-<conversation_id>.jsonl. Each
// line is { timestamp, type, payload } where type is one of session_meta |
// response_item | compacted | turn_context | event_msg. Token usage rides in
// event_msg records of inner type "token_count": payload.info.total_token_usage
// is a CUMULATIVE running total, so the session total is the LAST such record
// (never sum them). Verified against openai/codex Rust source (protocol.rs,
// recorder.rs) by research; treat most fields as optional.

export interface CodexTokenUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly reasoningOutputTokens: number;
  readonly totalTokens: number;
  // Context-meter inputs: last_token_usage.input_tokens is the current window
  // occupancy (the last request prompt, cached included); model_context_window
  // is the max. Both ride in the same token_count info block. 0 when absent.
  readonly lastInputTokens: number;
  readonly contextWindow: number;
}

export interface RolloutLine {
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly ts: number;
}

export function parseRolloutLine(line: string): RolloutLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  let rec: Record<string, unknown>;
  try { rec = JSON.parse(trimmed) as Record<string, unknown>; } catch { return null; }
  const type = typeof rec.type === "string" ? rec.type : null;
  if (!type) return null;
  const payload = rec.payload && typeof rec.payload === "object" ? (rec.payload as Record<string, unknown>) : {};
  const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : NaN;
  return { type, payload, ts: Number.isNaN(ts) ? 0 : ts };
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

// Pull the cumulative usage from an event_msg/token_count payload, or null when
// the record carries no usable info block.
export function tokenUsageFrom(payload: Record<string, unknown>): CodexTokenUsage | null {
  if (payload.type !== "token_count") return null;
  const info = payload.info;
  if (!info || typeof info !== "object") return null;
  const infoRec = info as Record<string, unknown>;
  const total = infoRec.total_token_usage;
  if (!total || typeof total !== "object") return null;
  const t = total as Record<string, unknown>;
  const last = infoRec.last_token_usage;
  const lastRec = last && typeof last === "object" ? (last as Record<string, unknown>) : null;
  return {
    inputTokens: num(t.input_tokens),
    cachedInputTokens: num(t.cached_input_tokens),
    outputTokens: num(t.output_tokens),
    reasoningOutputTokens: num(t.reasoning_output_tokens),
    totalTokens: num(t.total_tokens),
    lastInputTokens: lastRec ? num(lastRec.input_tokens) : num(t.input_tokens),
    contextWindow: num(infoRec.model_context_window),
  };
}

export function isFunctionCall(line: RolloutLine): boolean {
  return line.type === "response_item" && line.payload.type === "function_call";
}

export function functionCallName(line: RolloutLine): string | null {
  if (!isFunctionCall(line)) return null;
  const n = line.payload.name;
  return typeof n === "string" ? n : null;
}

export function isFunctionResult(line: RolloutLine): boolean {
  return line.type === "response_item" && line.payload.type === "function_call_output";
}

export function isMessage(line: RolloutLine): boolean {
  return line.type === "response_item" && line.payload.type === "message";
}

export function isError(line: RolloutLine): boolean {
  if (line.type !== "event_msg") return false;
  const t = line.payload.type;
  return t === "error" || t === "stream_error";
}

export function sessionMetaCwd(line: RolloutLine): string | null {
  if (line.type !== "session_meta") return null;
  const cwd = line.payload.cwd;
  return typeof cwd === "string" ? cwd : null;
}

export function sessionMetaId(line: RolloutLine): string | null {
  if (line.type !== "session_meta") return null;
  const id = line.payload.id;
  return typeof id === "string" ? id : null;
}

// turn_context records carry the per-turn model (a plain string).
export function turnContextModel(line: RolloutLine): string | null {
  if (line.type !== "turn_context") return null;
  const m = line.payload.model;
  return typeof m === "string" ? m : null;
}
