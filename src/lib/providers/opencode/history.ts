import { basename } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { modelFromApiId } from "../../shared/models.ts";
import type { ProviderSession, ProviderUsageRecord } from "../types.ts";
import { withDb, queryAll, num, str, type Row } from "./db.ts";

// Historical opencode sessions read straight from ~/.local/share/opencode/opencode.db.
// Unlike grok/codex there are no JSONL transcripts: the `session` table already
// carries real per-session cost + token aggregates, so a session maps to a
// ProviderSession with one usage record built from its columns. An mtime cache
// keyed on `time_updated` keeps re-scans cheap (only changed rows query counts).
const cache = new Map<string, { mtime: number; session: ProviderSession }>();

export function scanOpenCode(): ProviderSession[] {
  return withDb((db) => {
    const rows = queryAll(
      db,
      "SELECT id, directory, title, cost, tokens_input, tokens_output, tokens_reasoning, " +
        "tokens_cache_read, tokens_cache_write, model, time_created, time_updated FROM session",
    );
    const out: ProviderSession[] = [];
    for (const r of rows) {
      const id = str(r.id);
      if (!id) continue;
      const mtime = num(r.time_updated);
      const cached = cache.get(id);
      if (cached && cached.mtime >= mtime) {
        out.push(cached.session);
        continue;
      }
      const session = buildSession(db, r, id);
      cache.set(id, { mtime, session });
      out.push(session);
    }
    out.sort((a, b) => b.endedAt - a.endedAt);
    return out;
  }, []);
}

function buildSession(db: DatabaseSync, r: Row, id: string): ProviderSession {
  const cwd = str(r.directory) ?? "";
  const startedAt = num(r.time_created);
  const endedAt = num(r.time_updated) || startedAt;
  const model = resolveModel(str(r.model));
  const messageCount = num(
    queryAll(db, "SELECT COUNT(*) c FROM message WHERE session_id = ?", id)[0]?.c,
  );
  const toolUses = num(
    queryAll(
      db,
      "SELECT COUNT(*) c FROM part WHERE session_id = ? AND json_extract(data, '$.type') = 'tool'",
      id,
    )[0]?.c,
  );
  const usage: ProviderUsageRecord = {
    key: id,
    ts: endedAt,
    model,
    inputTokens: num(r.tokens_input),
    outputTokens: num(r.tokens_output) + num(r.tokens_reasoning),
    cacheReadTokens: num(r.tokens_cache_read),
    cacheCreate5mTokens: num(r.tokens_cache_write),
    cacheCreate1hTokens: 0,
  };
  return {
    provider: "opencode",
    id,
    cwd,
    project: basename(cwd) || cwd,
    startedAt,
    endedAt,
    model,
    firstPrompt: str(r.title) ?? "",
    messageCount,
    toolUses,
    // opencode keeps no on-disk "active session" marker; a live session's state
    // comes from the orchestrator snapshot, so history rows are always settled.
    state: "done",
    usage: [usage],
  };
}

// The session.model column is JSON: {"id","providerID","variant"}. Rebuild the
// "providerID/id" api id and map it to a catalogued ModelId, else keep the raw
// api id (opencode routes to many uncatalogued models).
function resolveModel(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const m = JSON.parse(raw) as { id?: unknown; providerID?: unknown };
    if (typeof m.providerID === "string" && typeof m.id === "string") {
      const apiId = `${m.providerID}/${m.id}`;
      return modelFromApiId(apiId) ?? apiId;
    }
  } catch { /* not JSON; fall through */ }
  return modelFromApiId(raw) ?? raw;
}
