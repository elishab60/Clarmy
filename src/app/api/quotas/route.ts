import { NextResponse } from "next/server";
import { buildQuotas } from "@/lib/quota/all";
import { createLogger } from "@/lib/util/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api/quotas");

// Real-time provider usage windows for the sidebar gauges. No input to validate
// (GET, no body); each reader is self-contained and degrades to a stub on its
// own rather than failing the whole response.
export async function GET() {
  try {
    return NextResponse.json(await buildQuotas());
  } catch (err) {
    log.error("quota build failed", { err: String(err) });
    return NextResponse.json({ error: "quota_failed" }, { status: 500 });
  }
}
