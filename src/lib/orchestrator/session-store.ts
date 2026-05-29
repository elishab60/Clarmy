import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { ApprovalMode, Effort, ModelId, ProviderId } from "../shared/types.ts";
import { isModelId } from "../shared/models.ts";
import { cockpitDir, sessionsFile } from "../claude-code/paths.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("session-store");

// One live PTY session, persisted so it survives a server/container restart.
// `claudeSessionId` is the CLI's own resumable session UUID (captured from the
// JSONL transcript). Without it a session cannot be resumed and is dropped.
export interface PersistedSession {
  readonly id: string;
  // Optional for back-compat with stores written before multi-provider; absent
  // means a Claude session.
  readonly provider?: ProviderId;
  readonly project: string;
  readonly cwd: string;
  readonly name: string;
  readonly model: ModelId;
  readonly allowedTools: readonly string[];
  readonly approvalMode: ApprovalMode;
  readonly branch?: string;
  readonly dangerouslySkipPermissions?: boolean;
  readonly effort?: Effort;
  readonly claudeSessionId?: string;
  readonly startedAt: number;
}

interface Store {
  readonly version: 1;
  readonly sessions: readonly PersistedSession[];
}

function emptyStore(): Store {
  return { version: 1, sessions: [] };
}

function read(): Store {
  const path = sessionsFile();
  if (!existsSync(path)) return emptyStore();
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!data || typeof data !== "object") return emptyStore();
    const rec = data as { sessions?: unknown };
    if (!Array.isArray(rec.sessions)) return emptyStore();
    return { version: 1, sessions: rec.sessions.filter(isPersistedSession) };
  } catch (e) {
    log.warn("failed to read sessions.json", { err: String(e) });
    return emptyStore();
  }
}

function write(store: Store): void {
  const path = sessionsFile();
  mkdirSync(cockpitDir(), { recursive: true });
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.cockpit.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

function isPersistedSession(v: unknown): v is PersistedSession {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return typeof s.id === "string"
    && typeof s.project === "string"
    && typeof s.cwd === "string"
    && typeof s.name === "string"
    && typeof s.model === "string" && isModelId(s.model)
    && Array.isArray(s.allowedTools)
    && typeof s.approvalMode === "string"
    && typeof s.startedAt === "number";
}

export function listPersisted(): PersistedSession[] {
  return [...read().sessions];
}

export function upsertPersisted(session: PersistedSession): void {
  const store = read();
  const idx = store.sessions.findIndex((s) => s.id === session.id);
  const sessions = [...store.sessions];
  if (idx < 0) sessions.push(session);
  else sessions[idx] = { ...sessions[idx], ...session };
  write({ version: 1, sessions });
}

export function patchPersisted(id: string, patch: Partial<PersistedSession>): void {
  const store = read();
  const idx = store.sessions.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const sessions = [...store.sessions];
  sessions[idx] = { ...sessions[idx]!, ...patch, id };
  write({ version: 1, sessions });
}

export function removePersisted(id: string): void {
  const store = read();
  const sessions = store.sessions.filter((s) => s.id !== id);
  if (sessions.length === store.sessions.length) return;
  write({ version: 1, sessions });
}
