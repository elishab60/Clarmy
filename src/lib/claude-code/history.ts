import { readdirSync, statSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-history");

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
  readonly state: "done" | "error" | "ongoing";
  readonly file: string;
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
  readonly lastRunAt: number;
  readonly firstRunAt: number;
  readonly branches: readonly string[];
}

const ROOT = resolve(homedir(), ".claude", "projects");

interface Cache {
  sessionsByDir: Map<string, CCSession[]>;
  perFileMtime: Map<string, number>;
  lastDirScan: number;
}

const cache: Cache = {
  sessionsByDir: new Map(),
  perFileMtime: new Map(),
  lastDirScan: 0,
};

const DIR_SCAN_TTL_MS = 15_000;

export function scanAll(): CCSession[] {
  let dirs: string[] = [];
  try {
    dirs = readdirSync(ROOT).filter((d) => !d.startsWith("."));
  } catch (err) {
    log.error("root not readable", { err: String(err), root: ROOT });
    return [];
  }

  const now = Date.now();
  const stale = now - cache.lastDirScan > DIR_SCAN_TTL_MS;
  const all: CCSession[] = [];

  for (const d of dirs) {
    const full = join(ROOT, d);
    let files: string[];
    try { files = readdirSync(full).filter((f) => f.endsWith(".jsonl")); }
    catch { continue; }

    let dirSessions = cache.sessionsByDir.get(full);
    const missing: string[] = [];

    if (!dirSessions || stale) { dirSessions = []; missing.push(...files); }
    else {
      const known = new Set(dirSessions.map((s) => s.file));
      for (const f of files) {
        const path = join(full, f);
        let mt = 0;
        try { mt = statSync(path).mtimeMs; } catch { continue; }
        const prev = cache.perFileMtime.get(path);
        if (!known.has(path) || prev == null || prev < mt) missing.push(path);
      }
    }

    for (const f of missing) {
      const path = f.startsWith(full) ? f : join(full, f);
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

  cache.lastDirScan = now;
  all.sort((a, b) => b.endedAt - a.endedAt);
  return all;
}

export function projectsFromSessions(sessions: readonly CCSession[]): CCProject[] {
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
          const usage = m.usage;
          if (usage && typeof usage === "object") {
            const u = usage as Record<string, unknown>;
            if (typeof u.input_tokens === "number") input += u.input_tokens;
            if (typeof u.output_tokens === "number") output += u.output_tokens;
            if (typeof u.cache_read_input_tokens === "number") cacheRead += u.cache_read_input_tokens;
            if (typeof u.cache_creation_input_tokens === "number") cacheCreate += u.cache_creation_input_tokens;
          }
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
      state,
      file,
    };
  } catch (err) {
    log.error("parse failed", { file, err: String(err) });
    return null;
  }
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
