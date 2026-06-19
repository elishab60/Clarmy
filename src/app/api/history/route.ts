import { NextResponse } from "next/server";
import { getMetricsIndex } from "@/lib/providers/metrics-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Served from the metrics index (stale-while-revalidate), so this never walks
// the transcript tree on the request path.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 300, 1), 2000);
  const cwd = url.searchParams.get("cwd");
  const provider = url.searchParams.get("provider");
  let { sessions } = await getMetricsIndex().history();
  if (cwd) sessions = sessions.filter((s) => s.cwd === cwd);
  if (provider) sessions = sessions.filter((s) => s.provider === provider);
  return NextResponse.json({ sessions: sessions.slice(0, limit) });
}
