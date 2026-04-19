import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PluginInfo } from "./plugins.ts";
import { userSkillsDir } from "./paths.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-skills");

export interface SkillInfo {
  readonly id: string;
  readonly name: string;
  readonly plugin: string;
  readonly marketplace?: string;
  readonly description: string;
  readonly path: string;
  readonly kind: "rigid" | "flexible";
  readonly enabled: boolean;
  readonly userLevel: boolean;
}

interface FrontMatter {
  readonly name?: string;
  readonly description?: string;
  readonly raw: Record<string, string>;
}

export function parseFrontMatter(text: string): FrontMatter {
  if (!text.startsWith("---")) return { raw: {} };
  const end = text.indexOf("\n---", 3);
  if (end === -1) return { raw: {} };
  const block = text.slice(3, end).trim();
  const raw: Record<string, string> = {};
  let currentKey: string | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (currentKey) raw[currentKey] = buf.join("\n").trim().replace(/^"|"$/g, "");
  };
  for (const line of block.split("\n")) {
    const m = /^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/.exec(line);
    if (m && !line.startsWith(" ") && !line.startsWith("\t")) {
      flush();
      currentKey = m[1]!;
      buf = [m[2]!];
    } else if (currentKey) {
      buf.push(line.trim());
    }
  }
  flush();
  return { name: raw.name, description: raw.description, raw };
}

function kindFromDescription(desc: string): "rigid" | "flexible" {
  const d = desc.toLowerCase();
  if (/\brigid\b|\bmust\b|\balways\b|follow exactly|verbatim/.test(d)) return "rigid";
  return "flexible";
}

function readSkillFile(path: string): { fm: FrontMatter; body: string } | null {
  try {
    const text = readFileSync(path, "utf8");
    const fm = parseFrontMatter(text);
    return { fm, body: text };
  } catch (err) {
    log.error("skill read failed", { path, err: String(err) });
    return null;
  }
}

export function scanSkills(plugins: readonly PluginInfo[]): SkillInfo[] {
  const out: SkillInfo[] = [];
  for (const p of plugins) {
    const skillsRoot = join(p.cachePath, "skills");
    let names: string[];
    try { names = readdirSync(skillsRoot); } catch { continue; }
    for (const n of names) {
      if (n.startsWith(".")) continue;
      const skillMd = join(skillsRoot, n, "SKILL.md");
      try { if (!statSync(skillMd).isFile()) continue; } catch { continue; }
      const parsed = readSkillFile(skillMd);
      if (!parsed) continue;
      const name = parsed.fm.name ?? n;
      const desc = parsed.fm.description ?? "";
      out.push({
        id: `${p.name}:${name}`,
        name,
        plugin: p.name,
        marketplace: p.marketplace,
        description: desc,
        path: skillMd,
        kind: kindFromDescription(desc),
        enabled: p.enabled,
        userLevel: false,
      });
    }
  }
  try {
    for (const n of readdirSync(userSkillsDir())) {
      if (n.startsWith(".")) continue;
      const skillMd = join(userSkillsDir(), n, "SKILL.md");
      try { if (!statSync(skillMd).isFile()) continue; } catch { continue; }
      const parsed = readSkillFile(skillMd);
      if (!parsed) continue;
      const name = parsed.fm.name ?? n;
      const desc = parsed.fm.description ?? "";
      out.push({
        id: `user:${name}`,
        name,
        plugin: "user",
        description: desc,
        path: skillMd,
        kind: kindFromDescription(desc),
        enabled: true,
        userLevel: true,
      });
    }
  } catch { /* no user skills dir */ }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function readSkillBody(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}
