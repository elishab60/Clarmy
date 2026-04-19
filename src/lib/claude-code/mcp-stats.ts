import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { projectsDir } from "./paths.ts";

export interface McpToolCall {
  readonly server: string;
  readonly tool: string;
  readonly ts: number;
  readonly ok: boolean;
  readonly sessionId: string;
}

interface Cache {
  byFile: Map<string, { mtime: number; calls: McpToolCall[] }>;
}
const cache: Cache = { byFile: new Map() };

const NAME_RE = /^mcp__([^_]+(?:_[^_]+)*?)__(.+)$/;

function parseFile(path: string): McpToolCall[] {
  const out: McpToolCall[] = [];
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return out;
  }
  let sessionId = path.split("/").pop()!.replace(/\.jsonl$/, "");
  const toolResultIds = new Map<string, boolean>();
  const pending: { id: string; call: Omit<McpToolCall, "ok"> }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let rec: Record<string, unknown>;
    try {
      rec = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof rec.sessionId === "string") sessionId = rec.sessionId;
    const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : 0;
    const msg = rec.message as Record<string, unknown> | undefined;
    const content = msg?.content;
    if (Array.isArray(content)) {
      for (const b of content) {
        if (!b || typeof b !== "object") continue;
        const bb = b as Record<string, unknown>;
        if (bb.type === "tool_use" && typeof bb.name === "string") {
          const m = NAME_RE.exec(bb.name);
          if (m) {
            pending.push({
              id: String(bb.id ?? ""),
              call: { server: m[1]!, tool: m[2]!, ts, sessionId },
            });
          }
        } else if (bb.type === "tool_result") {
          const id = typeof bb.tool_use_id === "string" ? bb.tool_use_id : "";
          toolResultIds.set(id, bb.is_error !== true);
        }
      }
    }
  }
  for (const p of pending) {
    const ok = p.id ? toolResultIds.get(p.id) ?? true : true;
    out.push({ ...p.call, ok });
  }
  return out;
}

export function scanMcpCalls(): McpToolCall[] {
  const all: McpToolCall[] = [];
  let dirs: string[];
  try {
    dirs = readdirSync(projectsDir());
  } catch {
    return [];
  }
  for (const d of dirs) {
    const dd = join(projectsDir(), d);
    let files: string[];
    try {
      files = readdirSync(dd).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const f of files) {
      const path = join(dd, f);
      let mt = 0;
      try {
        mt = statSync(path).mtimeMs;
      } catch {
        continue;
      }
      const c = cache.byFile.get(path);
      let calls: McpToolCall[];
      if (c && c.mtime === mt) {
        calls = c.calls;
      } else {
        calls = parseFile(path);
        cache.byFile.set(path, { mtime: mt, calls });
      }
      for (const c2 of calls) all.push(c2);
    }
  }
  return all.sort((a, b) => b.ts - a.ts);
}

export interface ServerAggregate {
  count: number;
  ok: number;
  err: number;
  lastTs: number;
  tools: Map<string, { count: number; lastTs: number }>;
}

export function aggregateByServer(calls: readonly McpToolCall[]): Map<string, ServerAggregate> {
  const out = new Map<string, ServerAggregate>();
  for (const c of calls) {
    const s = out.get(c.server) ?? { count: 0, ok: 0, err: 0, lastTs: 0, tools: new Map() };
    s.count++;
    if (c.ok) s.ok++;
    else s.err++;
    if (c.ts > s.lastTs) s.lastTs = c.ts;
    const t = s.tools.get(c.tool) ?? { count: 0, lastTs: 0 };
    t.count++;
    if (c.ts > t.lastTs) t.lastTs = c.ts;
    s.tools.set(c.tool, t);
    out.set(c.server, s);
  }
  return out;
}
