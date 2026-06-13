import { listAllSessionDirs } from "../providers/grok/paths.ts";
import { readEventStats } from "../providers/grok/transcript.ts";
import type { ProviderQuota } from "../shared/quota.ts";

// Grok bills via a subscription through cli-chat-proxy.grok.com and exposes no
// rate-limit gauge (unlike Codex) and no usage endpoint (unlike Claude), so
// there is no percentage to show. The only honest signal on disk is how many AI
// tool calls Grok has made, summed across its session transcripts. With nothing
// to show we return null so the sidebar omits the row entirely rather than
// rendering an empty gauge.
const MAX_SESSIONS = 20;

export function getGrokQuota(): ProviderQuota | null {
  const dirs = listAllSessionDirs()
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_SESSIONS);
  if (dirs.length === 0) return null;

  let tools = 0;
  for (const d of dirs) tools += readEventStats(d.path).toolUses;
  if (tools === 0) return null;

  return {
    provider: "grok",
    label: "Grok",
    state: "ok",
    plan: null,
    usedPercent: null, // no quota limit exposed; tool count is the only signal
    windows: [],
    detail: `${tools} AI tools used`,
    source: "grok-session-events",
    asOf: Date.now(),
  };
}
