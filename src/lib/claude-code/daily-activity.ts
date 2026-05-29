// Real per project activity for a given day, reconstructed from the Claude Code
// JSONL transcripts under ~/.claude/projects. This is the deterministic data
// source for the daily digest: sessions, input/output tokens and estimated cost,
// grouped by project (cwd) and filtered to one ISO date. No mocked data.

import { scanAll, type CCSession } from "./history.ts";
import { estimateCost } from "./pricing.ts";

export interface DailyProjectActivity {
  readonly project: string;
  readonly cwd: string;
  readonly sessions: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cost: number;
  readonly sessionIds: readonly string[];
  /** Transcript file paths for the day, so an agent can read them for narrative. */
  readonly files: readonly string[];
  /** First user prompt of each contributing session (real, for context). */
  readonly prompts: readonly string[];
}

export interface DailyActivity {
  readonly date: string;
  readonly totals: {
    readonly sessions: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly cost: number;
  };
  readonly projects: readonly DailyProjectActivity[];
}

interface Acc {
  project: string;
  cwd: string;
  sessions: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
  sessionIds: string[];
  files: string[];
  prompts: string[];
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function lastSegment(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? p;
}

/**
 * Aggregate real activity for `date` (ISO YYYY-MM-DD, UTC day, defaults today).
 * A session counts toward a day if it has at least one usage record stamped that
 * day; only that day's records contribute to the token/cost sums.
 */
export function buildDailyActivity(date: string = todayISO()): DailyActivity {
  const sessions: CCSession[] = scanAll();
  const byCwd = new Map<string, Acc>();
  let totIn = 0, totOut = 0, totCost = 0;
  const totSessions = new Set<string>();
  // Global dedup by message key (msgId:requestId), matching aggregateUsage in
  // history.ts: the same assistant message can appear more than once across the
  // JSONL streams, so counting every raw record would inflate tokens and cost.
  const seen = new Set<string>();

  for (const s of sessions) {
    let sIn = 0, sOut = 0, sCache = 0, sCost = 0;
    let active = false;
    for (const r of s.usage) {
      if (!r.ts) continue;
      if (new Date(r.ts).toISOString().slice(0, 10) !== date) continue;
      if (r.key) {
        if (seen.has(r.key)) continue;
        seen.add(r.key);
      }
      active = true;
      sIn += r.inputTokens;
      sOut += r.outputTokens;
      sCache += r.cacheReadTokens;
      sCost += estimateCost(r.model ?? s.model, {
        input: r.inputTokens,
        output: r.outputTokens,
        cacheRead: r.cacheReadTokens,
        cacheCreate5m: r.cacheCreate5mTokens,
        cacheCreate1h: r.cacheCreate1hTokens,
      });
    }
    if (!active) continue;

    const acc = byCwd.get(s.cwd) ?? {
      project: lastSegment(s.cwd), cwd: s.cwd, sessions: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cost: 0,
      sessionIds: [], files: [], prompts: [],
    };
    acc.sessions += 1;
    acc.inputTokens += sIn;
    acc.outputTokens += sOut;
    acc.cacheReadTokens += sCache;
    acc.cost += sCost;
    acc.sessionIds.push(s.id);
    acc.files.push(s.file);
    if (s.firstPrompt && s.firstPrompt !== "(no user prompt captured)") acc.prompts.push(s.firstPrompt);
    byCwd.set(s.cwd, acc);

    totIn += sIn; totOut += sOut; totCost += sCost;
    totSessions.add(s.id);
  }

  const projects = Array.from(byCwd.values()).sort((a, b) => b.cost - a.cost);
  return {
    date,
    totals: { sessions: totSessions.size, inputTokens: totIn, outputTokens: totOut, cost: totCost },
    projects,
  };
}
