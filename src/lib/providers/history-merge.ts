import type { ProviderId } from "../shared/types.ts";
import type { CCSession } from "../claude-code/history.ts";
import type { ProviderSession } from "./types.ts";

// One history row, normalised across every provider. Claude rows are the rich
// CCSession shape (branch, version, real token split); other providers fill the
// same fields best-effort, with tokens summed from their usage records. Every
// row carries `provider` so the UI can badge it and resume with the right CLI.
export interface HistorySession {
  readonly provider: ProviderId;
  readonly id: string;
  readonly file: string;
  readonly cwd: string;
  readonly project: string;
  readonly branch?: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly durationMs: number;
  readonly model?: string;
  readonly firstPrompt: string;
  readonly messageCount: number;
  readonly toolUses: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly state: "done" | "error" | "ongoing";
  readonly version?: string;
}

// Merge the rich Claude scan with the cross-vendor scan into one list, sorted
// most-recent first. `scanAllProviders()` already includes Claude (thin), so we
// drop its claude rows and use the rich CCSession ones instead.
export function mergeHistory(cc: readonly CCSession[], providers: readonly ProviderSession[]): HistorySession[] {
  const out: HistorySession[] = [];
  for (const s of cc) {
    if (s.isSubagent) continue;
    out.push({
      provider: "claude",
      id: s.id, file: s.file, cwd: s.cwd, project: s.project, branch: s.branch,
      startedAt: s.startedAt, endedAt: s.endedAt, durationMs: s.durationMs,
      model: s.model, firstPrompt: s.firstPrompt, messageCount: s.messageCount,
      toolUses: s.toolUses, inputTokens: s.inputTokens, outputTokens: s.outputTokens,
      cacheReadTokens: s.cacheReadTokens, state: s.state, version: s.version,
    });
  }
  for (const s of providers) {
    if (s.provider === "claude") continue; // already covered by the rich scan
    let input = 0, output = 0, cacheRead = 0;
    for (const u of s.usage) { input += u.inputTokens; output += u.outputTokens; cacheRead += u.cacheReadTokens; }
    out.push({
      provider: s.provider,
      id: s.id, file: `${s.provider}:${s.id}`, cwd: s.cwd, project: s.project,
      startedAt: s.startedAt, endedAt: s.endedAt, durationMs: Math.max(0, s.endedAt - s.startedAt),
      model: s.model, firstPrompt: s.firstPrompt ?? "", messageCount: s.messageCount,
      toolUses: s.toolUses, inputTokens: input, outputTokens: output,
      cacheReadTokens: cacheRead, state: s.state,
    });
  }
  out.sort((a, b) => b.endedAt - a.endedAt);
  return out;
}
