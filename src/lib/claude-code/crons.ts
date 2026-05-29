import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import type { CronJob, CronJobPatch } from "../shared/cron-types.ts";
import { cockpitDir, cronsFile } from "./paths.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("crons.store");

interface Store {
  readonly version: 1;
  readonly jobs: readonly CronJob[];
}

function emptyStore(): Store {
  return { version: 1, jobs: [] };
}

function read(): Store {
  const path = cronsFile();
  if (!existsSync(path)) return emptyStore();
  try {
    const raw = readFileSync(path, "utf8");
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object") return emptyStore();
    const rec = data as { version?: unknown; jobs?: unknown };
    if (!Array.isArray(rec.jobs)) return emptyStore();
    return { version: 1, jobs: rec.jobs.filter(isCronJob) };
  } catch (e) {
    log.warn("failed to read crons.json", { err: String(e) });
    return emptyStore();
  }
}

function write(store: Store): void {
  const path = cronsFile();
  mkdirSync(dirname(path), { recursive: true });
  mkdirSync(cockpitDir(), { recursive: true });
  const tmp = `${path}.cockpit.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
}

function isCronJob(v: unknown): v is CronJob {
  if (!v || typeof v !== "object") return false;
  const j = v as Record<string, unknown>;
  return typeof j.id === "string"
    && typeof j.name === "string"
    && typeof j.enabled === "boolean"
    && typeof j.createdAt === "string"
    && typeof j.updatedAt === "string"
    && typeof j.runCount === "number"
    && !!j.schedule && typeof j.schedule === "object"
    && !!j.spawn && typeof j.spawn === "object";
}

export function listCrons(): CronJob[] {
  return [...read().jobs];
}

export function getCron(id: string): CronJob | null {
  return read().jobs.find((j) => j.id === id) ?? null;
}

export function newCronId(): string {
  return `c_${randomBytes(4).toString("hex")}`;
}

export function createCron(input: Omit<CronJob, "id" | "createdAt" | "updatedAt" | "runCount">): CronJob {
  const store = read();
  const now = new Date().toISOString();
  const job: CronJob = {
    id: newCronId(),
    createdAt: now,
    updatedAt: now,
    runCount: 0,
    ...input,
  };
  write({ version: 1, jobs: [...store.jobs, job] });
  log.info("created", { id: job.id, name: job.name, schedule: job.schedule.kind });
  return job;
}

export function updateCron(id: string, patch: CronJobPatch): CronJob | null {
  const store = read();
  const idx = store.jobs.findIndex((j) => j.id === id);
  if (idx < 0) return null;
  const existing = store.jobs[idx]!;
  const next: CronJob = { ...existing, ...patch, id: existing.id, createdAt: existing.createdAt, runCount: existing.runCount, updatedAt: new Date().toISOString() };
  const jobs = [...store.jobs];
  jobs[idx] = next;
  write({ version: 1, jobs });
  return next;
}

export function recordRun(id: string, record: { sessionId?: string; error?: string }, nextFireAt?: string): CronJob | null {
  const store = read();
  const idx = store.jobs.findIndex((j) => j.id === id);
  if (idx < 0) return null;
  const existing = store.jobs[idx]!;
  const now = new Date().toISOString();
  const next: CronJob = {
    ...existing,
    updatedAt: now,
    runCount: existing.runCount + 1,
    lastFiredAt: now,
    lastRun: record.error
      ? { at: now, status: "error", error: record.error }
      : { at: now, status: "spawned", sessionId: record.sessionId },
    nextFireAt,
  };
  const jobs = [...store.jobs];
  jobs[idx] = next;
  write({ version: 1, jobs });
  return next;
}

export function setNextFire(id: string, nextFireAt: string | undefined): CronJob | null {
  return updateCron(id, { nextFireAt });
}

export function deleteCron(id: string): boolean {
  const store = read();
  const jobs = store.jobs.filter((j) => j.id !== id);
  if (jobs.length === store.jobs.length) return false;
  write({ version: 1, jobs });
  log.info("deleted", { id });
  return true;
}
