import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DiscoveredSession {
  readonly id: string;
  readonly projectPath: string;
  readonly updatedAt: number;
}

export async function listSessionsFromDisk(): Promise<DiscoveredSession[]> {
  const root = join(homedir(), ".claude", "projects");
  const projects = await safeReaddir(root);
  const out: DiscoveredSession[] = [];
  for (const p of projects) {
    const dir = join(root, p);
    const files = await safeReaddir(dir);
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const id = f.replace(/\.jsonl$/, "");
      try {
        const s = await stat(join(dir, f));
        out.push({ id, projectPath: p, updatedAt: s.mtimeMs });
      } catch { /* skip */ }
    }
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt);
  return out;
}

async function safeReaddir(path: string): Promise<string[]> {
  try { return await readdir(path); }
  catch { return []; }
}
