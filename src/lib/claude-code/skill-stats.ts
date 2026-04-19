import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { projectsDir } from "./paths.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-skill-stats");

export interface SkillInvocation {
  readonly skillName: string;
  readonly sessionId: string;
  readonly ts: number;
  readonly ok: boolean;
  readonly prompt: string;
  readonly file: string;
}

interface Cache {
  byFile: Map<string, { mtime: number; invs: SkillInvocation[] }>;
}
const cache: Cache = { byFile: new Map() };

const SLASH_RE = /^\/(?:([a-z0-9-]+):)?([a-z0-9-]+)\b/;

function parseFile(path: string): SkillInvocation[] {
  const out: SkillInvocation[] = [];
  let text: string;
  try { text = readFileSync(path, "utf8"); } catch { return out; }
  let sessionId = path.split("/").pop()!.replace(/\.jsonl$/, "");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let rec: Record<string, unknown>;
    try { rec = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (typeof rec.sessionId === "string") sessionId = rec.sessionId;
    const ts = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : 0;
    const type = rec.type;
    if (type === "user") {
      const m = rec.message as Record<string, unknown> | undefined;
      const c = m?.content;
      let textContent: string | null = null;
      if (typeof c === "string") textContent = c;
      else if (Array.isArray(c)) {
        for (const b of c) {
          if (b && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string") {
            textContent = (b as { text: string }).text; break;
          }
        }
      }
      if (textContent) {
        const mm = SLASH_RE.exec(textContent);
        if (mm) out.push({ skillName: mm[2]!, sessionId, ts, ok: true, prompt: textContent.slice(0, 140), file: path });
      }
    } else if (type === "assistant") {
      const m = rec.message as Record<string, unknown> | undefined;
      const content = m?.content;
      if (Array.isArray(content)) {
        for (const b of content) {
          if (b && typeof b === "object"
            && (b as { type?: unknown }).type === "tool_use"
            && (b as { name?: unknown }).name === "Skill") {
            const input = (b as { input?: unknown }).input;
            if (input && typeof input === "object") {
              const skill = (input as { skill?: unknown }).skill;
              if (typeof skill === "string") {
                out.push({ skillName: skill.split(":").pop() ?? skill, sessionId, ts, ok: true, prompt: "", file: path });
              }
            }
          }
        }
      }
    }
  }
  return out;
}

export function scanSkillInvocations(sinceMs?: number): SkillInvocation[] {
  const all: SkillInvocation[] = [];
  let dirs: string[];
  try { dirs = readdirSync(projectsDir()); } catch { return []; }
  for (const d of dirs) {
    const dd = join(projectsDir(), d);
    let files: string[];
    try { files = readdirSync(dd).filter((f) => f.endsWith(".jsonl")); } catch { continue; }
    for (const f of files) {
      const path = join(dd, f);
      let mt = 0;
      try { mt = statSync(path).mtimeMs; } catch { continue; }
      const c = cache.byFile.get(path);
      let invs: SkillInvocation[];
      if (c && c.mtime === mt) invs = c.invs;
      else {
        invs = parseFile(path);
        cache.byFile.set(path, { mtime: mt, invs });
      }
      for (const inv of invs) {
        if (sinceMs && inv.ts < sinceMs) continue;
        all.push(inv);
      }
    }
  }
  log.debug("scan complete", { count: all.length });
  return all.sort((a, b) => b.ts - a.ts);
}
