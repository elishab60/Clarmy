import { createLogger } from "../util/logger.ts";
import { getManager } from "./manager.ts";
import { listCrons, recordRun, setNextFire, updateCron } from "../claude-code/crons.ts";
import type { CronJob, CronSchedule } from "../shared/cron-types.ts";

const log = createLogger("cron.scheduler");

const ALIASES: Record<string, string> = {
  "@yearly":   "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly":  "0 0 1 * *",
  "@weekly":   "0 0 * * 0",
  "@daily":    "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly":   "0 * * * *",
};

interface ParsedCron {
  readonly minute: ReadonlySet<number>;
  readonly hour: ReadonlySet<number>;
  readonly dom: ReadonlySet<number>;
  readonly month: ReadonlySet<number>;
  readonly dow: ReadonlySet<number>;
  readonly domRestricted: boolean;
  readonly dowRestricted: boolean;
}

export interface CronValidation {
  readonly ok: boolean;
  readonly error?: string;
  readonly humanHint?: string;
}

export function validateCronExpression(expr: string): CronValidation {
  try {
    parseCronExpression(expr);
    return { ok: true, humanHint: describeCron(expr) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function parseCronExpression(raw: string): ParsedCron {
  const trimmed = raw.trim().toLowerCase();
  const expanded = ALIASES[trimmed] ?? raw.trim();
  const parts = expanded.split(/\s+/);
  if (parts.length !== 5) throw new Error(`cron expression must have 5 fields, got ${parts.length}`);
  const [m, h, dom, mon, dow] = parts as [string, string, string, string, string];
  return {
    minute: parseField(m, 0, 59, {}),
    hour: parseField(h, 0, 23, {}),
    dom: parseField(dom, 1, 31, {}),
    month: parseField(mon, 1, 12, { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }),
    dow: parseField(normalizeDow(dow), 0, 6, { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }),
    domRestricted: dom !== "*" && dom !== "?",
    dowRestricted: dow !== "*" && dow !== "?",
  };
}

function normalizeDow(s: string): string {
  return s.replace(/\b7\b/g, "0");
}

function parseField(field: string, min: number, max: number, names: Record<string, number>): Set<number> {
  const out = new Set<number>();
  const parts = field.split(",");
  for (const part of parts) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? parseInt(stepPart, 10) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`invalid step in field "${field}"`);
    let rangeStart = min, rangeEnd = max;
    const rp = rangePart ?? "*";
    if (rp === "*" || rp === "?") {
      // keep full
    } else if (rp.includes("-")) {
      const [a, b] = rp.split("-");
      rangeStart = resolveAtom(a!, names);
      rangeEnd = resolveAtom(b!, names);
    } else {
      rangeStart = rangeEnd = resolveAtom(rp, names);
    }
    if (rangeStart < min || rangeEnd > max || rangeStart > rangeEnd) {
      throw new Error(`out-of-range value in "${field}" (allowed ${min}-${max})`);
    }
    for (let v = rangeStart; v <= rangeEnd; v += step) out.add(v);
  }
  if (out.size === 0) throw new Error(`empty field "${field}"`);
  return out;
}

function resolveAtom(a: string, names: Record<string, number>): number {
  const s = a.trim().toLowerCase();
  if (s in names) return names[s]!;
  const n = parseInt(s, 10);
  if (!Number.isInteger(n)) throw new Error(`unrecognized token "${a}"`);
  return n;
}

export function computeNextFire(schedule: CronSchedule, from: Date = new Date()): Date | null {
  if (schedule.kind === "oneshot") {
    const t = new Date(schedule.at);
    if (Number.isNaN(t.getTime())) return null;
    if (t.getTime() <= from.getTime()) return null;
    return t;
  }
  const parsed = parseCronExpression(schedule.expression);
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const limit = new Date(from);
  limit.setFullYear(limit.getFullYear() + 4);
  while (d.getTime() < limit.getTime()) {
    if (matches(parsed, d)) return d;
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

function matches(c: ParsedCron, d: Date): boolean {
  if (!c.minute.has(d.getMinutes())) return false;
  if (!c.hour.has(d.getHours())) return false;
  if (!c.month.has(d.getMonth() + 1)) return false;
  const domOk = c.dom.has(d.getDate());
  const dowOk = c.dow.has(d.getDay());
  if (c.domRestricted && c.dowRestricted) return domOk || dowOk;
  if (c.domRestricted) return domOk;
  if (c.dowRestricted) return dowOk;
  return true;
}

export function describeCron(expr: string): string {
  const trimmed = expr.trim().toLowerCase();
  if (trimmed in ALIASES) return trimmed;
  const next = computeNextFire({ kind: "recurring", expression: expr }, new Date());
  return next ? `next: ${next.toLocaleString()}` : "no future fire";
}

let loopHandle: ReturnType<typeof setInterval> | null = null;
let started = false;

export function startCronScheduler(): void {
  if (started) return;
  started = true;
  log.info("cron scheduler starting", { tickMs: 1000 });
  bootstrapNextFires();
  loopHandle = setInterval(() => { void tick(); }, 1000);
}

export function stopCronScheduler(): void {
  if (loopHandle) { clearInterval(loopHandle); loopHandle = null; }
  started = false;
}

function bootstrapNextFires(): void {
  const jobs = listCrons();
  const now = new Date();
  for (const job of jobs) {
    if (!job.enabled) continue;
    if (job.nextFireAt) {
      const t = new Date(job.nextFireAt);
      if (!Number.isNaN(t.getTime()) && t.getTime() > now.getTime()) continue;
    }
    const next = computeNextFire(job.schedule, now);
    setNextFire(job.id, next ? next.toISOString() : undefined);
  }
}

async function tick(): Promise<void> {
  const now = new Date();
  const jobs = listCrons();
  for (const job of jobs) {
    if (!job.enabled) continue;
    const fireAt = job.nextFireAt ? new Date(job.nextFireAt) : null;
    if (!fireAt || Number.isNaN(fireAt.getTime())) {
      const next = computeNextFire(job.schedule, now);
      setNextFire(job.id, next ? next.toISOString() : undefined);
      continue;
    }
    if (fireAt.getTime() > now.getTime()) continue;
    await fire(job, now);
  }
}

async function fire(job: CronJob, now: Date): Promise<void> {
  log.info("firing cron", { id: job.id, name: job.name });
  try {
    const sessionId = await getManager().spawn({
      provider: job.spawn.provider ?? "claude",
      project: job.spawn.project,
      cwd: job.spawn.cwd,
      name: job.spawn.name,
      model: job.spawn.model,
      prompt: job.spawn.prompt,
      allowedTools: job.spawn.allowedTools,
      approvalMode: job.spawn.approvalMode,
      branch: job.spawn.branch,
      dangerouslySkipPermissions: job.spawn.dangerouslySkipPermissions,
      effort: job.spawn.effort,
    });
    const nextFire = job.schedule.kind === "recurring"
      ? computeNextFire(job.schedule, now)
      : null;
    recordRun(job.id, { sessionId }, nextFire ? nextFire.toISOString() : undefined);
    if (job.schedule.kind === "oneshot") {
      updateCron(job.id, { enabled: false });
    }
    log.info("cron fired", { id: job.id, sessionId, next: nextFire?.toISOString() });
  } catch (e) {
    const err = String(e);
    log.error("cron fire failed", { id: job.id, err });
    const nextFire = job.schedule.kind === "recurring"
      ? computeNextFire(job.schedule, now)
      : null;
    recordRun(job.id, { error: err }, nextFire ? nextFire.toISOString() : undefined);
  }
}

export async function runCronNow(id: string): Promise<{ ok: boolean; sessionId?: string; error?: string }> {
  const job = listCrons().find((j) => j.id === id);
  if (!job) return { ok: false, error: "not_found" };
  try {
    const sessionId = await getManager().spawn({
      provider: job.spawn.provider ?? "claude",
      project: job.spawn.project,
      cwd: job.spawn.cwd,
      name: job.spawn.name,
      model: job.spawn.model,
      prompt: job.spawn.prompt,
      allowedTools: job.spawn.allowedTools,
      approvalMode: job.spawn.approvalMode,
      branch: job.spawn.branch,
      dangerouslySkipPermissions: job.spawn.dangerouslySkipPermissions,
      effort: job.spawn.effort,
    });
    recordRun(job.id, { sessionId }, job.nextFireAt);
    return { ok: true, sessionId };
  } catch (e) {
    const err = String(e);
    recordRun(job.id, { error: err }, job.nextFireAt);
    return { ok: false, error: err };
  }
}
