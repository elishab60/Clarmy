import { readFileSync } from "node:fs";

// One entry in Gemini's logs.json. Records are user messages only; no token
// counts (those live in the headless --output-format json stats object or in
// OpenTelemetry exports, neither of which is written to logs.json).
export interface GeminiLogRecord {
  readonly sessionId?: string;
  readonly messageId?: number;
  readonly type?: string;
  readonly message?: string;
  readonly timestamp?: string;
}

// Tolerates both the historical single JSON array file and the newer
// append-only JSONL form (migration in flight upstream, issue #15292).
export function readGeminiLogs(file: string): GeminiLogRecord[] {
  let text: string;
  try { text = readFileSync(file, "utf8"); } catch { return []; }
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    try {
      const arr = JSON.parse(trimmed) as unknown;
      return Array.isArray(arr) ? arr.filter(isRecord) : [];
    } catch { return []; }
  }
  const out: GeminiLogRecord[] = [];
  for (const raw of trimmed.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try {
      const rec = JSON.parse(line) as unknown;
      if (isRecord(rec)) out.push(rec);
    } catch { /* skip partial line */ }
  }
  return out;
}

function isRecord(v: unknown): v is GeminiLogRecord {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
