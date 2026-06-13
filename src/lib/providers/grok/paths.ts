import { readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { homedir } from "node:os";

// ~/.grok holds all Grok CLI state. Per-session transcripts live under
// sessions/<encoded-cwd>/<session-id>/, where <encoded-cwd> is
// encodeURIComponent of the workspace absolute path (so "/" becomes "%2F" and
// the dir name stays flat). Each session dir carries summary.json (metadata),
// events.jsonl (turn/tool stream) and updates.jsonl (ACP chunks + token counts).
export function grokHome(): string {
  return process.env.GROK_HOME ?? resolve(homedir(), ".grok");
}

export function grokSessionsDir(): string {
  return join(grokHome(), "sessions");
}

// The on-disk dir name Grok uses for a given workspace path.
export function projectDirName(cwd: string): string {
  return encodeURIComponent(cwd);
}

export function projectDir(cwd: string): string {
  return join(grokSessionsDir(), projectDirName(cwd));
}

export interface GrokSessionDir {
  readonly id: string; // session uuid (dir name)
  readonly path: string; // absolute dir path
  readonly cwd: string; // decoded workspace path
  readonly mtimeMs: number;
}

function decodeCwd(name: string): string {
  try { return decodeURIComponent(name); } catch { return name; }
}

function sessionDirsUnder(projPath: string, cwd: string): GrokSessionDir[] {
  let ids: string[];
  try { ids = readdirSync(projPath); } catch { return []; }
  const out: GrokSessionDir[] = [];
  for (const id of ids) {
    if (id.startsWith(".")) continue;
    const path = join(projPath, id);
    let st;
    try { st = statSync(path); } catch { continue; }
    if (!st.isDirectory()) continue; // skips prompt_history.jsonl etc.
    out.push({ id, path, cwd, mtimeMs: st.mtimeMs });
  }
  return out;
}

// Every session dir across every project under ~/.grok/sessions. Returns [] when
// ~/.grok is absent.
export function listAllSessionDirs(): GrokSessionDir[] {
  const root = grokSessionsDir();
  let projects: string[];
  try { projects = readdirSync(root); } catch { return []; }
  const out: GrokSessionDir[] = [];
  for (const proj of projects) {
    if (proj.startsWith(".")) continue;
    const projPath = join(root, proj);
    let pst;
    try { pst = statSync(projPath); } catch { continue; }
    if (!pst.isDirectory()) continue; // skips session_search.sqlite
    out.push(...sessionDirsUnder(projPath, decodeCwd(proj)));
  }
  return out;
}

// Session dirs for one known workspace path.
export function sessionDirsForCwd(cwd: string): GrokSessionDir[] {
  return sessionDirsUnder(projectDir(cwd), cwd);
}

export const SUMMARY_FILE = "summary.json";
export const EVENTS_FILE = "events.jsonl";
export const UPDATES_FILE = "updates.jsonl";
