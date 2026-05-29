import { NextResponse } from "next/server";
import { getClaudeQuota } from "@/lib/quota/claude";
import { getCodexQuota } from "@/lib/quota/codex";
import { getGeminiQuota } from "@/lib/quota/gemini";
import { createLogger } from "@/lib/util/logger";
import type { QuotasResponse } from "@/lib/shared/quota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const log = createLogger("api/quotas");

// Real-time provider usage windows for the sidebar gauges. No input to validate
// (GET, no body); each reader is self-contained and degrades to a stub on its
// own rather than failing the whole response.
export async function GET() {
  try {
    const [claude, codex, gemini] = await Promise.all([
      getClaudeQuota(),
      Promise.resolve().then(getCodexQuota),
      Promise.resolve().then(getGeminiQuota),
    ]);
    const body: QuotasResponse = {
      generatedAt: Date.now(),
      providers: [claude, codex, gemini],
    };
    return NextResponse.json(body);
  } catch (err) {
    log.error("quota build failed", { err: String(err) });
    return NextResponse.json({ error: "quota_failed" }, { status: 500 });
  }
}
