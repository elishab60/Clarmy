import { NextResponse } from "next/server";
import { getControl } from "@/lib/orchestrator/control";
import { scanAllProviders } from "@/lib/providers/scan-all";
import { estimateCost, refreshPricing } from "@/lib/claude-code/pricing";
import { modelFromApiId } from "@/lib/shared/models";
import { PROVIDER_IDS, type ProviderId } from "@/lib/shared/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns one compact row per recorded session, across every provider, each row
// tagged with its provider so the client keeps the numbers strictly separate
// (the metrics view filters to the active provider before aggregating). Usage is
// deduped per-provider by msg:req key (resumed transcripts replay prior turns);
// tokens AND cost are summed from the deduped records.
export async function GET() {
  await refreshPricing();
  const live = await getControl().list();
  const sessions = scanAllProviders();

  const seen = new Set<string>();
  const rows = sessions.map((s) => {
    let cost = 0, input = 0, output = 0, cacheRead = 0, cacheCreate = 0;
    const daily: Record<string, { c: number; o: number }> = {};
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
    };
  });

  const liveByProvider = Object.fromEntries(PROVIDER_IDS.map((p) => [p, 0])) as Record<ProviderId, number>;
  for (const l of live) liveByProvider[l.provider] = (liveByProvider[l.provider] ?? 0) + 1;

  return NextResponse.json({
    generatedAt: Date.now(),
    liveSessions: live.length,
    liveByProvider,
    sessions: rows,
  });
}
