import { basename } from "node:path";
import type { ProviderSession } from "../types.ts";
import { listAllSessionDirs, type GrokSessionDir } from "./paths.ts";
import { readSummary, readEventStats, readUsageRecords, contentMtime, activeSessionIds } from "./transcript.ts";

// Historical Grok sessions from ~/.grok/sessions/<cwd>/<id>/. Cheap re-scans via
// an mtime cache (keyed on summary.json's mtime), mirroring the Codex scanner.
//
// Grok's coding models run through cli-chat-proxy.grok.com on a subscription and
// the transcript stores NO billed token counts (unlike Claude). Token usage is
// instead reconstructed from the cumulative context size Grok does record, with
// resent context modelled as cache reads (see readUsageRecords). Cost is then the
// usual estimateCost over those records using list-price grok rates, so Grok
// flows through the same metrics/history pipeline as the other providers.
const cache = new Map<string, { mtime: number; session: ProviderSession | null }>();

export function scanGrok(): ProviderSession[] {
  const active = activeSessionIds();
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
    const session = buildSession(d, active);
    cache.set(d.path, { mtime, session });
    if (session) out.push(session);
  }
  out.sort((a, b) => b.endedAt - a.endedAt);
  return out;
}

function buildSession(d: GrokSessionDir, active: Set<string>): ProviderSession {
  const s = readSummary(d.path);
  const id = s?.id ?? d.id;
  const cwd = s?.cwd ?? d.cwd;
  const startedAt = s?.createdAt || d.mtimeMs;
  const endedAt = s?.endedAt || d.mtimeMs || startedAt;
  return {
    provider: "grok",
    id,
    cwd,
    project: basename(cwd) || cwd,
    startedAt,
    endedAt,
    model: s?.model,
    messageCount: s?.messageCount ?? 0,
    toolUses: readEventStats(d.path).toolUses,
    state: active.has(id) ? "ongoing" : "done",
    usage: readUsageRecords(d.path, id, s?.model),
  };
}

function withState(session: ProviderSession, active: Set<string>): ProviderSession {
  const next: ProviderSession["state"] = active.has(session.id) ? "ongoing" : "done";
  return next === session.state ? session : { ...session, state: next };
}
