import type { ProviderSession } from "../types.ts";
import { listProjectDirs, logsFile } from "./paths.ts";
import { readGeminiLogs } from "./logs.ts";

interface Acc {
  startedAt: number;
  endedAt: number;
  messageCount: number;
}

// Historical Gemini sessions, reconstructed from ~/.gemini/tmp/<hash>/logs.json.
// logs.json carries no token usage and no cwd, so usage is empty and the project
// is keyed by the opaque project_hash dir. Returns [] when ~/.gemini is absent.
//
// Durable token accounting requires enabling Gemini's OpenTelemetry export; this
// scanner deliberately does not guess token counts it cannot see.
export function scanGemini(): ProviderSession[] {
  const out: ProviderSession[] = [];
  for (const dir of listProjectDirs()) {
    const records = readGeminiLogs(logsFile(dir.path));
    if (records.length === 0) continue;
    const bySession = new Map<string, Acc>();
    for (const r of records) {
      const sid = r.sessionId ?? dir.hash;
      const ts = r.timestamp ? Date.parse(r.timestamp) : NaN;
      const acc = bySession.get(sid) ?? { startedAt: Number.POSITIVE_INFINITY, endedAt: 0, messageCount: 0 };
      acc.messageCount++;
      if (!Number.isNaN(ts)) {
        if (ts < acc.startedAt) acc.startedAt = ts;
        if (ts > acc.endedAt) acc.endedAt = ts;
      }
      bySession.set(sid, acc);
    }
    const short = dir.hash.slice(0, 8);
    for (const [sid, acc] of bySession) {
      const startedAt = Number.isFinite(acc.startedAt) ? acc.startedAt : dir.mtimeMs;
      out.push({
        provider: "gemini",
        id: sid,
        cwd: `gemini:${dir.hash}`,
        project: `gemini ${short}`,
        startedAt,
        endedAt: acc.endedAt || startedAt,
        messageCount: acc.messageCount,
        toolUses: 0,
        state: "done",
        usage: [],
      });
    }
  }
  out.sort((a, b) => b.endedAt - a.endedAt);
  return out;
}
