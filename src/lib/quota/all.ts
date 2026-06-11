import { getClaudeQuota } from "./claude.ts";
import { getCodexQuota } from "./codex.ts";
import { getGeminiQuota } from "./gemini.ts";
import type { QuotasResponse } from "../shared/quota.ts";

// One snapshot of every provider's usage windows. Shared by the /api/quotas
// route and the ws-server's periodic push. Each reader degrades to a stub on
// its own (and getClaudeQuota has its own freshness cache + backoff), so this
// is cheap to call and never throws as a whole.
export async function buildQuotas(): Promise<QuotasResponse> {
  const [claude, codex, gemini] = await Promise.all([
    getClaudeQuota(),
    Promise.resolve().then(getCodexQuota),
    Promise.resolve().then(getGeminiQuota),
  ]);
  return { generatedAt: Date.now(), providers: [claude, codex, gemini] };
}
