import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import { createLogger } from "../../util/logger.ts";
import type { ProviderSession, ProviderUsageRecord } from "../types.ts";
import { listRolloutFiles } from "./paths.ts";
import {
  parseRolloutLine, tokenUsageFrom, isFunctionCall, isMessage, isError,
  sessionMetaCwd, sessionMetaId, turnContextModel, type CodexTokenUsage,
} from "./rollout.ts";

const log = createLogger("codex-history");

const cache = new Map<string, { mtime: number; session: ProviderSession | null }>();

// Parse every Codex rollout transcript into a normalised ProviderSession. Cheap
// re-scans via an mtime cache. Returns [] when ~/.codex/sessions is absent.
export function scanCodex(): ProviderSession[] {
  const files = listRolloutFiles();
  const out: ProviderSession[] = [];
  for (const f of files) {
    const cached = cache.get(f.path);
    if (cached && cached.mtime >= f.mtimeMs) {
      if (cached.session) out.push(cached.session);
      continue;
    }
    const session = parseRolloutFile(f.path);
    cache.set(f.path, { mtime: f.mtimeMs, session });
    if (session) out.push(session);
  }
  out.sort((a, b) => b.endedAt - a.endedAt);
  return out;
}

function parseRolloutFile(path: string): ProviderSession | null {
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { return null; }
  let cwd: string | undefined;
  let id: string | undefined;
  let model: string | undefined;
  let firstTs = Number.POSITIVE_INFINITY;
  let lastTs = 0;
  let messageCount = 0;
  let toolUses = 0;
  let firstPrompt = "";
  let sawError = false;
  let lastUsage: CodexTokenUsage | null = null;
  let lastUsageTs = 0;

  try {
    for (const raw of text.split("\n")) {
      const line = parseRolloutLine(raw);
      if (!line) continue;
      if (line.ts) {
        if (line.ts < firstTs) firstTs = line.ts;
        if (line.ts > lastTs) lastTs = line.ts;
      }
      cwd ??= sessionMetaCwd(line) ?? undefined;
      id ??= sessionMetaId(line) ?? undefined;
      const m = turnContextModel(line);
      if (m) model = m;
      if (isMessage(line)) {
        messageCount++;
        if (!firstPrompt) firstPrompt = userMessageText(line.payload);
      }
      if (isFunctionCall(line)) toolUses++;
      if (isError(line)) sawError = true;
      const usage = tokenUsageFrom(line.payload);
      if (usage) { lastUsage = usage; lastUsageTs = line.ts || lastTs; }
    }
  } catch (err) {
    log.error("parse failed", { path, err: String(err) });
    return null;
  }

  if (!cwd) cwd = "(codex)";
  if (firstTs === Number.POSITIVE_INFINITY) firstTs = 0;
  const sessionId = id ?? basename(path).replace(/\.jsonl$/, "");
  const endedAt = lastTs || firstTs;

  const usage: ProviderUsageRecord[] = lastUsage
    ? [toUsageRecord(sessionId, lastUsage, lastUsageTs || endedAt, model)]
    : [];

  return {
    provider: "codex",
    id: sessionId,
    cwd,
    project: lastSegment(cwd),
    startedAt: firstTs,
    endedAt,
    model,
    firstPrompt: firstPrompt.slice(0, 300),
    messageCount,
    toolUses,
    state: sawError ? "error" : "done",
    usage,
  };
}

// Best-effort first user prompt from a response_item/message payload. Codex
// stores content either as a plain string or an array of {type, text} parts.
function userMessageText(payload: Record<string, unknown>): string {
  if (payload.role !== "user") return "";
  const content = payload.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const c of content) {
    if (c && typeof c === "object") {
      const t = (c as { text?: unknown }).text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.join(" ").trim();
}

// total_token_usage is cumulative; map it to the cache-aware fields the cost
// estimator expects. cached_input_tokens is a subset of input_tokens, so the
// billable non-cached input is the difference; reasoning output is billed as
// output.
function toUsageRecord(sessionId: string, u: CodexTokenUsage, ts: number, model: string | undefined): ProviderUsageRecord {
  return {
    key: `${sessionId}:codex-total`,
    ts,
    model,
    inputTokens: Math.max(0, u.inputTokens - u.cachedInputTokens),
    outputTokens: u.outputTokens + u.reasoningOutputTokens,
    cacheReadTokens: u.cachedInputTokens,
    cacheCreate5mTokens: 0,
    cacheCreate1hTokens: 0,
  };
}

function lastSegment(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}
