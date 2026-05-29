import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import { createHash } from "node:crypto";

// ~/.gemini holds all Gemini CLI state. Per-project runtime state lives under
// tmp/<project_hash>/ where project_hash is a SHA-256 of the project root
// absolute path. We compute the hash to locate a known cwd's dir, and also
// enumerate tmp/ for historical sessions whose cwd we cannot recover (logs.json
// does not record it).
export function geminiHome(): string {
  return process.env.GEMINI_HOME ?? resolve(homedir(), ".gemini");
}

export function geminiTmpDir(): string {
  return join(geminiHome(), "tmp");
}

// Best-effort: matches the documented SHA-256(project-root-abs-path). Exact
// input may vary by version, so callers fall back to dir enumeration.
export function projectHash(cwd: string): string {
  return createHash("sha256").update(cwd).digest("hex");
}

export interface GeminiProjectDir {
  readonly hash: string;
  readonly path: string;
  readonly mtimeMs: number;
}

export function listProjectDirs(): GeminiProjectDir[] {
  const tmp = geminiTmpDir();
  let entries: string[];
  try { entries = readdirSync(tmp); } catch { return []; }
  const out: GeminiProjectDir[] = [];
  for (const name of entries) {
    if (name.startsWith(".")) continue;
    const path = join(tmp, name);
    let st;
    try { st = statSync(path); } catch { continue; }
    if (!st.isDirectory()) continue;
    out.push({ hash: name, path, mtimeMs: st.mtimeMs });
  }
  return out;
}

export function logsFile(projectDirPath: string): string {
  return join(projectDirPath, "logs.json");
}
