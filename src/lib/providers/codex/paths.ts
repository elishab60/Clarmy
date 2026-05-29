import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

// ~/.codex unless CODEX_HOME overrides it (Codex respects that env var).
export function codexHome(): string {
  return process.env.CODEX_HOME ?? resolve(homedir(), ".codex");
}

export function codexSessionsDir(): string {
  return join(codexHome(), "sessions");
}

export interface RolloutFile {
  readonly path: string;
  readonly mtimeMs: number;
}

// Walk ~/.codex/sessions/<YYYY>/<MM>/<DD>/ collecting rollout-*.jsonl files. The
// tree is shallow and date-sharded, so a bounded recursive scan is cheap.
// Returns [] when the dir is absent (Codex not installed / never run).
export function listRolloutFiles(sinceMs = 0): RolloutFile[] {
  const root = codexSessionsDir();
  const out: RolloutFile[] = [];
  walk(root, 0, sinceMs, out);
  return out;
}

function walk(dir: string, depth: number, sinceMs: number, out: RolloutFile[]): void {
  if (depth > 4) return;
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      walk(full, depth + 1, sinceMs, out);
    } else if (name.startsWith("rollout-") && name.endsWith(".jsonl")) {
      if (st.mtimeMs < sinceMs) continue;
      out.push({ path: full, mtimeMs: st.mtimeMs });
    }
  }
}
