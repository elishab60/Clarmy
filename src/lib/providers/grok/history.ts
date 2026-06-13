import { basename } from "node:path";
import type { ProviderSession, ProviderUsageRecord } from "../types.ts";
import { listAllSessionDirs, type GrokSessionDir } from "./paths.ts";
import {
  readSummary, readSignals, readEventStats, readUsageRecords, readUnifiedUsage,
  contentMtime, activeSessionIds,
} from "./transcript.ts";

// Historical Grok sessions from ~/.grok/sessions/<cwd>/<id>/. Cheap re-scans via
// an mtime cache (keyed on the freshest content file), mirroring the Codex scanner.
//
// Token usage is REAL: Grok logs every model call's prompt/cached/completion
// tokens to ~/.grok/logs/unified.jsonl (the numbers its `/usage` view shows). We
// read that once per scan and attach each session's records. That global log
// rotates, so for a session no longer present we fall back to reconstructing
// usage from the cumulative context size (readUsageRecords). Cost is the usual
// estimateCost over those records, so Grok flows through the same
// metrics/history pipeline as the other providers.
const cache = new Map<string, { mtime: number; session: ProviderSession | null }>();

export function scanGrok(): ProviderSession[] {
  const active = activeSessionIds();
  const unified = readUnifiedUsage();
  const out: ProviderSession[] = [];
  for (const d of listAllSessionDirs()) {
    const mtime = contentMtime(d.path) || d.mtimeMs;
    const cached = cache.get(d.path);
    if (cached && cached.mtime >= mtime) {
      // state depends on active_sessions.json, which moves independently of the
      // transcript, so recompute it even on a cache hit.
      if (cached.session) out.push(withState(cached.session, active));
      continue;
    }
    const session = buildSession(d, active, unified);
    cache.set(d.path, { mtime, session });
    if (session) out.push(session);
  }
  out.sort((a, b) => b.endedAt - a.endedAt);
  return out;
}

function buildSession(
  d: GrokSessionDir,
  active: Set<string>,
  unified: Map<string, ProviderUsageRecord[]>,
): ProviderSession {
  const s = readSummary(d.path);
  const sig = readSignals(d.path);
  const id = s?.id ?? d.id;
  const cwd = s?.cwd ?? d.cwd;
  const startedAt = s?.createdAt || d.mtimeMs;
  const endedAt = s?.endedAt || d.mtimeMs || startedAt;
  const model = s?.model ?? sig?.model;
  // Real billed usage from the global log; reconstruct from context size only
  // when this session has rolled out of that log.
  const usage = unified.get(id) ?? readUsageRecords(d.path, id, model);
  return {
    provider: "grok",
    id,
    cwd,
    project: basename(cwd) || cwd,
    startedAt,
    endedAt,
    model,
    messageCount: s?.messageCount ?? 0,
    toolUses: sig?.toolUses ?? readEventStats(d.path).toolUses,
    state: active.has(id) ? "ongoing" : "done",
    usage,
  };
}

function withState(session: ProviderSession, active: Set<string>): ProviderSession {
  const next: ProviderSession["state"] = active.has(session.id) ? "ongoing" : "done";
  return next === session.state ? session : { ...session, state: next };
}
