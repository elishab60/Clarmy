import { readdirSync, statSync, readFileSync, type Dirent } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-history");

export interface CCUsageRecord {
  readonly key: string | null;
  readonly ts: number;
  readonly model?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreate5mTokens: number;
  readonly cacheCreate1hTokens: number;
}

export interface CCSession {
  readonly id: string;
  readonly cwd: string;
  readonly project: string;
  readonly projectDir: string;
  readonly branch?: string;
  readonly version?: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly model?: string;
  readonly firstPrompt: string;
  readonly messageCount: number;
  readonly toolUses: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreateTokens: number;
  readonly cacheCreate5mTokens: number;
  readonly cacheCreate1hTokens: number;
  readonly state: "done" | "error" | "ongoing";
  readonly file: string;
  readonly isSubagent: boolean;
  readonly usage: readonly CCUsageRecord[];
}

export interface CCProject {
  readonly id: string;
  readonly cwd: string;
  readonly name: string;
  readonly projectDir: string;
  readonly sessions: number;
  readonly messages: number;
  readonly toolUses: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheCreateTokens: number;
  readonly cacheCreate5mTokens: number;
  readonly cacheCreate1hTokens: number;
  readonly lastRunAt: number;
  readonly firstRunAt: number;
  readonly branches: readonly string[];
}

const ROOT = resolve(homedir(), ".claude", "projects");

interface Cache {
  sessionsByDir: Map<string, CCSession[]>;
  perFileMtime: Map<string, number>;
}

const cache: Cache = {
  sessionsByDir: new Map(),
  perFileMtime: new Map(),
};

// Subagent / Workflow transcripts live in nested dirs the CLI writes under a
// session, e.g. <project>/<session-uuid>/subagents/**/*.jsonl (and
// subagents/workflows/wf_*/agent-*.jsonl). Walk the whole project subtree so
// their token usage is not dropped from the cost metric. Depth-capped as a
// runaway guard; the real layout is only a few levels deep.
function listJsonlFiles(dir: string, depth = 0): string[] {
  if (depth > 6) return [];
  let out: string[] = [];
  let entries: Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name.startsWith(".")) continue;
      out = out.concat(listJsonlFiles(p, depth + 1));
    } else if (e.isFile() && e.name.endsWith(".jsonl")) {
      out.push(p);
    }
  }
  return out;
}

export function scanAll(): CCSession[] {
  let dirs: string[] = [];
  try {
    dirs = readdirSync(ROOT).filter((d) => !d.startsWith("."));
  } catch (err) {
    log.error("root not readable", { err: String(err), root: ROOT });
    return [];
  }

  const all: CCSession[] = [];

  for (const d of dirs) {
    const full = join(ROOT, d);
    // Absolute paths, including nested subagent/workflow transcripts.
    const files = listJsonlFiles(full);
    if (files.length === 0) { cache.sessionsByDir.delete(full); continue; }

    // mtime decides what gets reparsed, every scan. (A TTL used to force a
    // full directory reparse here, which made every warm rebuild a cold one.)
    const fileSet = new Set(files);
    let dirSessions = (cache.sessionsByDir.get(full) ?? []).filter((s) => fileSet.has(s.file));
    const known = new Set(dirSessions.map((s) => s.file));
    const missing: string[] = [];
    for (const path of files) {
      let mt = 0;
      try { mt = statSync(path).mtimeMs; } catch { continue; }
      const prev = cache.perFileMtime.get(path);
      if (!known.has(path) || prev == null || prev < mt) missing.push(path);
    }

    for (const path of missing) {
      const sess = parseSession(path, full);
      if (sess) {
        const idx = dirSessions.findIndex((s) => s.file === path);
        if (idx >= 0) dirSessions[idx] = sess;
        else dirSessions.push(sess);
        try { cache.perFileMtime.set(path, statSync(path).mtimeMs); } catch { /* ignore */ }
      }
    }

    cache.sessionsByDir.set(full, dirSessions);
    for (const s of dirSessions) all.push(s);
  }

  // Fold subagent transcripts into their parent session (shared sessionId) so a
  // session's cost includes the work its Task/Workflow subagents did.
  const merged = mergeBySession(all);
  merged.sort((a, b) => b.endedAt - a.endedAt);
  return merged;
}

// Subagent transcripts carry the parent's `sessionId`, so parseSession gives
// them the same `id` as the main transcript. Group by id and fold children into
// the main session; orphan subagents (no main transcript scanned) keep their own
// row so their cost is still counted.
function mergeBySession(sessions: CCSession[]): CCSession[] {
  const groups = new Map<string, CCSession[]>();
  for (const s of sessions) {
    const arr = groups.get(s.id);
    if (arr) arr.push(s);
    else groups.set(s.id, [s]);
  }
  const out: CCSession[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { out.push(group[0]!); continue; }
    const base = group.find((g) => !g.isSubagent)
      ?? group.reduce((a, b) => (a.startedAt <= b.startedAt ? a : b));
    out.push(foldGroup(base, group));
  }
  return out;
}

function foldGroup(base: CCSession, group: readonly CCSession[]): CCSession {
  let input = 0, output = 0, cacheRead = 0, cacheCreate = 0, cacheCreate5m = 0, cacheCreate1h = 0;
  let messageCount = 0, toolUses = 0;
  let startedAt = Number.POSITIVE_INFINITY;
  let endedAt = 0;
  const usage: CCUsageRecord[] = [];
  for (const s of group) {
    input += s.inputTokens;
    output += s.outputTokens;
    cacheRead += s.cacheReadTokens;
    cacheCreate += s.cacheCreateTokens;
    cacheCreate5m += s.cacheCreate5mTokens;
    cacheCreate1h += s.cacheCreate1hTokens;
    messageCount += s.messageCount;
    toolUses += s.toolUses;
    if (s.startedAt && s.startedAt < startedAt) startedAt = s.startedAt;
    if (s.endedAt > endedAt) endedAt = s.endedAt;
    usage.push(...s.usage);
  }
  if (!Number.isFinite(startedAt)) startedAt = base.startedAt;
  const end = endedAt || base.endedAt;
  return {
    ...base,
    startedAt,
    endedAt: end,
    durationMs: Math.max(0, end - startedAt),
    messageCount,
    toolUses,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheCreateTokens: cacheCreate,
    cacheCreate5mTokens: cacheCreate5m,
    cacheCreate1hTokens: cacheCreate1h,
    usage,
  };
}

export function projectsFromSessions(sessions: readonly Omit<CCSession, "usage">[]): CCProject[] {
  const by = new Map<string, CCProject>();
  for (const s of sessions) {
    const key = s.cwd;
    const prev = by.get(key);
    const branches = new Set<string>(prev?.branches ?? []);
    if (s.branch && s.branch !== "HEAD") branches.add(s.branch);
    by.set(key, {
      id: slug(s.cwd),
      cwd: s.cwd,
      name: lastSegment(s.cwd),
      projectDir: s.projectDir,
      sessions: (prev?.sessions ?? 0) + 1,
      messages: (prev?.messages ?? 0) + s.messageCount,
      toolUses: (prev?.toolUses ?? 0) + s.toolUses,
      inputTokens: (prev?.inputTokens ?? 0) + s.inputTokens,
      outputTokens: (prev?.outputTokens ?? 0) + s.outputTokens,
      cacheReadTokens: (prev?.cacheReadTokens ?? 0) + s.cacheReadTokens,
      cacheCreateTokens: (prev?.cacheCreateTokens ?? 0) + s.cacheCreateTokens,
      cacheCreate5mTokens: (prev?.cacheCreate5mTokens ?? 0) + s.cacheCreate5mTokens,
      cacheCreate1hTokens: (prev?.cacheCreate1hTokens ?? 0) + s.cacheCreate1hTokens,
      lastRunAt: Math.max(prev?.lastRunAt ?? 0, s.endedAt),
      firstRunAt: prev ? Math.min(prev.firstRunAt, s.startedAt) : s.startedAt,
      branches: Array.from(branches),
    });
  }
  return Array.from(by.values()).sort((a, b) => b.lastRunAt - a.lastRunAt);
}

function parseSession(file: string, projectDir: string): CCSession | null {
  try {
    const idFromFile = file.split("/").pop()!.replace(/\.jsonl$/, "");
    let cwd: string | undefined;
    let sessionId: string | undefined;
    let branch: string | undefined;
    let version: string | undefined;
    let firstTs = Number.POSITIVE_INFINITY;
    let lastTs = 0;
    let model: string | undefined;
    let firstPrompt = "";
    let messageCount = 0;
    let toolUses = 0;
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    let cacheCreate = 0;
    let cacheCreate5m = 0;
    let cacheCreate1h = 0;
    const usage: CCUsageRecord[] = [];
    let sawError = false;
    let sawInterrupt = false;

    const text = readFileSync(file, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      let rec: Record<string, unknown>;
      try { rec = JSON.parse(line) as Record<string, unknown>; }
      catch { continue; }

      if (typeof rec.cwd === "string" && !cwd) cwd = rec.cwd;
      if (typeof rec.sessionId === "string" && !sessionId) sessionId = rec.sessionId;
      if (typeof rec.gitBranch === "string" && rec.gitBranch) branch = rec.gitBranch;
      if (typeof rec.version === "string" && !version) version = rec.version;

      const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : NaN;
      if (!Number.isNaN(ts)) {
        if (ts < firstTs) firstTs = ts;
        if (ts > lastTs) lastTs = ts;
      }

      const type = rec.type;
      if (type === "assistant") {
        messageCount++;
        const msg = rec.message;
        if (msg && typeof msg === "object") {
          const m = msg as Record<string, unknown>;
          if (typeof m.model === "string") model = m.model;
          const uObj = m.usage;
          let inTok = 0, outTok = 0, crTok = 0, c5m = 0, c1h = 0;
          if (uObj && typeof uObj === "object") {
            const u = uObj as Record<string, unknown>;
            if (typeof u.input_tokens === "number") inTok = u.input_tokens;
            if (typeof u.output_tokens === "number") outTok = u.output_tokens;
            if (typeof u.cache_read_input_tokens === "number") crTok = u.cache_read_input_tokens;
            const cc = u.cache_creation;
            if (cc && typeof cc === "object") {
              const c = cc as Record<string, unknown>;
              if (typeof c.ephemeral_5m_input_tokens === "number") c5m = c.ephemeral_5m_input_tokens;
              if (typeof c.ephemeral_1h_input_tokens === "number") c1h = c.ephemeral_1h_input_tokens;
            } else if (typeof u.cache_creation_input_tokens === "number") {
              c5m = u.cache_creation_input_tokens;
            }
          }
          input += inTok; output += outTok; cacheRead += crTok;
          cacheCreate5m += c5m; cacheCreate1h += c1h;
          cacheCreate += c5m + c1h;
          const msgId = typeof m.id === "string" ? m.id : null;
          const reqId = typeof rec.requestId === "string" ? rec.requestId : null;
          usage.push({
            key: msgId && reqId ? `${msgId}:${reqId}` : null,
            ts: Number.isNaN(ts) ? 0 : ts,
            model,
            inputTokens: inTok,
            outputTokens: outTok,
            cacheReadTokens: crTok,
            cacheCreate5mTokens: c5m,
            cacheCreate1hTokens: c1h,
          });
          const content = m.content;
          if (Array.isArray(content)) {
            for (const b of content) {
              if (b && typeof b === "object" && (b as { type?: unknown }).type === "tool_use") toolUses++;
            }
          }
        }
      } else if (type === "user") {
        messageCount++;
        if (!firstPrompt) {
          const msg = rec.message;
          if (msg && typeof msg === "object") {
            const m = msg as Record<string, unknown>;
            const c = m.content;
            if (typeof c === "string") firstPrompt = c.slice(0, 140);
            else if (Array.isArray(c)) {
              for (const b of c) {
                if (b && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string") {
                  firstPrompt = ((b as { text: string }).text).slice(0, 140);
                  break;
                }
              }
            }
          }
        }
      } else if (type === "system" || type === "error") {
        if (type === "error") sawError = true;
      } else if (rec.subtype === "error_during_execution" || rec.is_error === true) {
        sawError = true;
      }
      if (rec.subtype === "interrupted" || type === "interrupted") sawInterrupt = true;
    }

    if (!cwd) return null;
    if (firstTs === Number.POSITIVE_INFINITY) firstTs = 0;

    const state: CCSession["state"] = sawError ? "error" : sawInterrupt ? "error" : "done";

    return {
      id: sessionId ?? idFromFile,
      cwd,
      project: lastSegment(cwd),
      projectDir,
      branch,
      version,
      startedAt: firstTs,
      endedAt: lastTs || firstTs,
      durationMs: Math.max(0, (lastTs || firstTs) - firstTs),
      model,
      firstPrompt: firstPrompt || "(no user prompt captured)",
      messageCount,
      toolUses,
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: cacheRead,
      cacheCreateTokens: cacheCreate,
      cacheCreate5mTokens: cacheCreate5m,
      cacheCreate1hTokens: cacheCreate1h,
      state,
      file,
      isSubagent: file.includes("/subagents/"),
      usage,
    };
  } catch (err) {
    log.error("parse failed", { file, err: String(err) });
    return null;
  }
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreate5mTokens: number;
  cacheCreate1hTokens: number;
  messages: number;
}

export interface AggregatedUsage {
  readonly totals: UsageTotals & { costUsd: number };
  readonly perCwd: Map<string, UsageTotals & { costUsd: number }>;
  readonly perModel: Map<string, UsageTotals & { sessions: number; costUsd: number }>;
  readonly perDay: Map<string, UsageTotals & { sessions: number; toolUses: number; costUsd: number }>;
  readonly dedupedMessages: number;
  readonly duplicateMessages: number;
}

export type CostFn = (model: string | undefined, r: CCUsageRecord) => number;

function emptyTotals(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreate5mTokens: 0, cacheCreate1hTokens: 0, messages: 0 };
}

function addUsage(t: UsageTotals, r: CCUsageRecord): void {
  t.inputTokens += r.inputTokens;
  t.outputTokens += r.outputTokens;
  t.cacheReadTokens += r.cacheReadTokens;
  t.cacheCreate5mTokens += r.cacheCreate5mTokens;
  t.cacheCreate1hTokens += r.cacheCreate1hTokens;
  t.messages += 1;
}

export function aggregateUsage(sessions: readonly CCSession[], costFn: CostFn = () => 0): AggregatedUsage {
  const seen = new Set<string>();
  const totals = { ...emptyTotals(), costUsd: 0 };
  const perCwd = new Map<string, UsageTotals & { costUsd: number }>();
  const perModel = new Map<string, UsageTotals & { sessions: number; costUsd: number }>();
  const perDay = new Map<string, UsageTotals & { sessions: number; toolUses: number; costUsd: number }>();

  const sessionsByModel = new Map<string, Set<string>>();
  const sessionsByDay = new Map<string, Set<string>>();
  const toolUsesByDay = new Map<string, number>();

  let duplicates = 0, deduped = 0;

  for (const s of sessions) {
    if (s.endedAt) {
      const day = new Date(s.endedAt).toISOString().slice(0, 10);
      toolUsesByDay.set(day, (toolUsesByDay.get(day) ?? 0) + s.toolUses);
      let set = sessionsByDay.get(day);
      if (!set) { set = new Set(); sessionsByDay.set(day, set); }
      set.add(s.id);
    }

    for (const rec of s.usage) {
      if (rec.key) {
        if (seen.has(rec.key)) { duplicates++; continue; }
        seen.add(rec.key);
      }
      deduped++;
      const mLabel = rec.model ?? s.model ?? "unknown";
      const cost = costFn(mLabel, rec);

      addUsage(totals, rec); totals.costUsd += cost;

      const cwdT = perCwd.get(s.cwd) ?? { ...emptyTotals(), costUsd: 0 };
      addUsage(cwdT, rec); cwdT.costUsd += cost;
      perCwd.set(s.cwd, cwdT);

      const mT = perModel.get(mLabel) ?? { ...emptyTotals(), sessions: 0, costUsd: 0 };
      addUsage(mT, rec); mT.costUsd += cost;
      perModel.set(mLabel, mT);
      let mS = sessionsByModel.get(mLabel);
      if (!mS) { mS = new Set(); sessionsByModel.set(mLabel, mS); }
      mS.add(s.id);

      if (rec.ts) {
        const day = new Date(rec.ts).toISOString().slice(0, 10);
        const dT = perDay.get(day) ?? { ...emptyTotals(), sessions: 0, toolUses: 0, costUsd: 0 };
        addUsage(dT, rec); dT.costUsd += cost;
        perDay.set(day, dT);
      }
    }
  }

  for (const [m, set] of sessionsByModel) {
    const t = perModel.get(m); if (t) t.sessions = set.size;
  }
  for (const [day, t] of perDay) {
    t.sessions = sessionsByDay.get(day)?.size ?? 0;
    t.toolUses = toolUsesByDay.get(day) ?? 0;
  }
  for (const [day, set] of sessionsByDay) {
    if (!perDay.has(day)) {
      perDay.set(day, { ...emptyTotals(), sessions: set.size, toolUses: toolUsesByDay.get(day) ?? 0, costUsd: 0 });
    }
  }

  return { totals, perCwd, perModel, perDay, dedupedMessages: deduped, duplicateMessages: duplicates };
}

function slug(s: string): string {
  return s.replace(/^\//, "").replace(/[^a-zA-Z0-9._-]+/g, "-").toLowerCase().slice(0, 80);
}

function lastSegment(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

export function findClaudeCliPath(): string | null {
  const candidates = [
    process.env.CLAUDE_CLI_PATH,
    resolve(homedir(), ".local/bin/claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ].filter((x): x is string => !!x);
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch { /* skip */ }
  }
  return null;
}
