import { NextResponse } from "next/server";
import { getMetricsIndex } from "@/lib/providers/metrics-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served from the metrics index (stale-while-revalidate), so this never walks
// the transcript tree on the request path.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const rawLimit = url.searchParams.get("limit");
  // `limit=all` (or `0`) returns every indexed session; a positive number is clamped.
  const unlimited = rawLimit === "all" || rawLimit === "0";
  const limit = Math.min(Math.max(Number(rawLimit) || 300, 1), 5000);
  const cwd = url.searchParams.get("cwd");
  const provider = url.searchParams.get("provider");
  let { sessions } = await getMetricsIndex().history();
  if (cwd) sessions = sessions.filter((s) => s.cwd === cwd);
  if (provider) sessions = sessions.filter((s) => s.provider === provider);
  return NextResponse.json({ sessions: unlimited ? sessions : sessions.slice(0, limit) });
}
