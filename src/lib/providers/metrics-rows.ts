import { estimateCost } from "../claude-code/pricing.ts";
import { modelFromApiId } from "../shared/models.ts";
import type { ProviderId } from "../shared/providers.ts";
import type { ProviderSession } from "./types.ts";

// One compact row per recorded session: the expensive half of /api/metrics
// (per-record dedup + pricing). Pure data, structured-clone safe, so it can be
// computed in a worker thread and posted back. Shape matches the client's
// SessionRow exactly.
export interface ModelSlice {
  cost: number;
  input: number;
  output: number;
  cacheRead: number;
}

export interface MetricsRow {
  readonly id: string;
  readonly provider: ProviderId;
  readonly cwd: string;
  readonly project: string;
  readonly model: string;
  readonly rawModel: string | null;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly day: string | null;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreate: number;
  readonly toolUses: number;
  readonly messages: number;
  readonly cost: number;
  readonly state: "done" | "error" | "ongoing";
  readonly daily: Record<string, { c: number; o: number }>;
  // Exact per-model attribution, built record by record: a session whose main
  // thread runs one model but whose workflow/Task subagents ran another (opus
  // parent + fable readers, say) splits its numbers accordingly.
  readonly models: Record<string, ModelSlice>;
}

export function computeRows(sessions: readonly ProviderSession[]): MetricsRow[] {
  const seen = new Set<string>();
  return sessions.map((s) => {
    let cost = 0, input = 0, output = 0, cacheRead = 0, cacheCreate = 0;
    const daily: Record<string, { c: number; o: number }> = {};
    const models: Record<string, ModelSlice> = {};
    for (const r of s.usage) {
      if (r.key) {
        const dedupKey = `${s.provider}:${r.key}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);
      }
      input += r.inputTokens;
      output += r.outputTokens;
      cacheRead += r.cacheReadTokens;
      cacheCreate += r.cacheCreate5mTokens + r.cacheCreate1hTokens;
      const rc = estimateCost(r.model ?? s.model, {
        input: r.inputTokens,
        output: r.outputTokens,
        cacheRead: r.cacheReadTokens,
        cacheCreate5m: r.cacheCreate5mTokens,
        cacheCreate1h: r.cacheCreate1hTokens,
      });
      cost += rc;
      const label = modelFromApiId(r.model ?? s.model ?? null) ?? r.model ?? s.model ?? "unknown";
      const slice = (models[label] ??= { cost: 0, input: 0, output: 0, cacheRead: 0 });
      slice.cost += rc;
      slice.input += r.inputTokens;
      slice.output += r.outputTokens;
      slice.cacheRead += r.cacheReadTokens;
      if (r.ts) {
        const dk = new Date(r.ts).toISOString().slice(0, 10);
        const e = (daily[dk] ??= { c: 0, o: 0 });
        e.c += rc;
        e.o += r.outputTokens;
      }
    }
    const endedAt = s.endedAt || s.startedAt;
    return {
      id: s.id,
      provider: s.provider,
      cwd: s.cwd,
      project: s.project,
      model: modelFromApiId(s.model ?? null) ?? s.model ?? "unknown",
      rawModel: s.model ?? null,
      startedAt: s.startedAt,
      endedAt,
      day: endedAt ? new Date(endedAt).toISOString().slice(0, 10) : null,
      input,
      output,
      cacheRead,
      cacheCreate,
      toolUses: s.toolUses,
      messages: s.messageCount,
      cost,
      state: s.state,
      daily,
      models,
    };
  });
}
