import { basename } from "node:path";
import type { ProviderSession } from "../types.ts";
import { listAllSessionDirs } from "./paths.ts";
import { readSummary, activeSessionIds } from "./transcript.ts";

// Historical Grok sessions, reconstructed from ~/.grok/sessions/<cwd>/<id>/
// summary.json (cheap: one small JSON per session, no events.jsonl walk).
//
// Grok's coding models run through cli-chat-proxy.grok.com on a subscription, and
// the on-disk transcript records no billed input/output/cache token counts (only
// a cumulative context size in updates.jsonl). So usage is left empty and cost
// stays 0, deliberately — this scanner does not guess numbers it cannot see. The
// model, message count and timestamps it can see still feed per-model monitoring.
export function scanGrok(): ProviderSession[] {
  const active = activeSessionIds();
  const out: ProviderSession[] = [];
  for (const d of listAllSessionDirs()) {
    const s = readSummary(d.path);
    const id = s?.id ?? d.id;
    const cwd = s?.cwd ?? d.cwd;
    const startedAt = s?.createdAt || d.mtimeMs;
    const endedAt = s?.endedAt || d.mtimeMs || startedAt;
    out.push({
      provider: "grok",
      id,
      cwd,
      project: basename(cwd) || cwd,
      startedAt,
      endedAt,
      model: s?.model,
      messageCount: s?.messageCount ?? 0,
      toolUses: 0,
      state: active.has(id) ? "ongoing" : "done",
      usage: [],
    });
  }
  out.sort((a, b) => b.endedAt - a.endedAt);
  return out;
}
