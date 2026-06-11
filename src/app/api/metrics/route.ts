import { NextResponse } from "next/server";
import { getControl } from "@/lib/orchestrator/control";
import { getMetricsIndex } from "@/lib/providers/metrics-index";
import { PROVIDER_IDS, type ProviderId } from "@/lib/shared/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Returns one compact row per recorded session across every provider. The
// expensive part (tree walk, dedup, pricing) is served from the metrics index,
// which rebuilds only when a transcript actually changed (fs.watch); this
// route is normally a cache read. Live counts stay per-request: they come from
// the in-memory manager and are free.
export async function GET() {
  const [live, { generatedAt, rows }] = await Promise.all([
    getControl().list(),
    getMetricsIndex().payload(),
  ]);

  const liveByProvider = Object.fromEntries(PROVIDER_IDS.map((p) => [p, 0])) as Record<ProviderId, number>;
  for (const l of live) liveByProvider[l.provider] = (liveByProvider[l.provider] ?? 0) + 1;

  return NextResponse.json({
    generatedAt,
    liveSessions: live.length,
    liveByProvider,
    sessions: rows,
  });
}
