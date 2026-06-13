import type { Effort, SpawnConfig } from "../../shared/types.ts";
import { apiIdFor } from "../../shared/models.ts";
import { findClaudeCliPath, scanAll } from "../../claude-code/history.ts";
import { SessionTailer } from "../../claude-code/session-tailer.ts";
import type { CliDriver, LiveTailer, ProviderSession, TailPatch } from "../types.ts";

// Effort levels Claude Code accepts as the `--effort` launch flag. Everything
// else (today: "ultracode") is applied at runtime via the /effort slash command.
const CLI_EFFORT_FLAGS: ReadonlySet<Effort> = new Set(["low", "medium", "high", "xhigh", "max"]);

export const claudeDriver: CliDriver = {
  id: "claude",
  promptDelivery: "type",

  findCli() {
    return findClaudeCliPath();
  },

  buildArgs(cfg: SpawnConfig, effort: Effort | null): string[] {
    const args: string[] = [];
    if (cfg.resumeSessionId) args.push("--resume", cfg.resumeSessionId);
    const model = apiIdFor(cfg.model);
    if (model) args.push("--model", model);
    if (effort && CLI_EFFORT_FLAGS.has(effort)) args.push("--effort", effort);
    if (cfg.dangerouslySkipPermissions) args.push("--dangerously-skip-permissions");
    else if (cfg.approvalMode === "auto") args.push("--permission-mode", "acceptEdits");
    else if (cfg.approvalMode === "strict") args.push("--permission-mode", "default");
    return args;
  },

  envExtras() {
    return {};
  },

  mcpConfigArgs(path: string): string[] {
    return ["--mcp-config", path];
  },

  effortInArgs(effort: Effort): boolean {
    return CLI_EFFORT_FLAGS.has(effort);
  },

  effortSlash(effort: Effort): string | null {
    return `/effort ${effort}`;
  },

  createTailer(cwd: string, startedAt: number, onPatch: (p: TailPatch) => void): LiveTailer {
    return new SessionTailer(cwd, startedAt, onPatch);
  },

  scanSessions(): ProviderSession[] {
    return scanAll().map((s) => ({
      provider: "claude" as const,
      id: s.id,
      cwd: s.cwd,
      project: s.project,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      model: s.model,
      messageCount: s.messageCount,
      toolUses: s.toolUses,
      state: s.state,
      usage: s.usage,
    }));
  },
};
