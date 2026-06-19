import { statSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { createLogger } from "../../util/logger.ts";
import { opencodeDbPath } from "./paths.ts";

const log = createLogger("opencode-db");

// Load node:sqlite via process.getBuiltinModule so no bundler (Vite/Next/webpack)
// ever sees a static "node:sqlite" import to (mis)resolve; the real builtin is
// returned at runtime. Undefined only on Node < 22.3, where the DB stays disabled.
type SqliteModule = typeof import("node:sqlite");
const sqlite: SqliteModule | undefined = process.getBuiltinModule?.("node:sqlite");

export type Row = Record<string, unknown>;

// Open the opencode SQLite DB read-only and run `fn`, returning `fallback` on any
// failure (DB absent, locked, schema drift). We open per call rather than holding
// a handle so we never block opencode's own writes; the DB is tiny so this is
// cheap. Read-only + WAL means we see the latest committed state.
export function withDb<T>(fn: (db: DatabaseSync) => T, fallback: T): T {
  if (!sqlite) return fallback;
  const path = opencodeDbPath();
  try {
    statSync(path); // cheap "exists" probe so a missing DB is silent, not thrown.
  } catch {
    return fallback;
  }
  let db: DatabaseSync | null = null;
  try {
    db = new sqlite.DatabaseSync(path, { readOnly: true });
    return fn(db);
  } catch (err) {
    log.warn("opencode db read failed", { err: String(err) });
    return fallback;
  } finally {
    try { db?.close(); } catch { /* ignore */ }
  }
}

export function queryAll(db: DatabaseSync, sql: string, ...params: (string | number)[]): Row[] {
  try {
    return db.prepare(sql).all(...params) as Row[];
  } catch (err) {
    log.warn("opencode query failed", { sql, err: String(err) });
    return [];
  }
}

export function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
