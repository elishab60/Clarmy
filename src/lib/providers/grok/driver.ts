import type { SpawnConfig } from "../../shared/types.ts";
import { apiIdFor } from "../../shared/models.ts";
import { resolveCliPath } from "../cli-path.ts";
import type { CliDriver, LiveTailer, ProviderSession, TailPatch } from "../types.ts";
import { GrokTailer } from "./tailer.ts";
import { scanGrok } from "./history.ts";

// Grok is driven as its interactive TUI: the prompt is passed as a positional
// arg (we do not type into its TUI), the model via -m, and approval via
// --permission-mode / --always-approve. Grok's coding models report
// supports_reasoning_effort=false, so effort is never delivered even though the
// binary exposes a global --effort flag. Resume re-opens a prior session by id.
export const grokDriver: CliDriver = {
  id: "grok",
  promptDelivery: "arg",

  findCli() {
    return resolveCliPath("grok", process.env.GROK_CLI_PATH);
  },

  buildArgs(cfg: SpawnConfig): string[] {
    const args: string[] = [];
    const model = apiIdFor(cfg.model);
    if (model) args.push("-m", model);
    if (cfg.resumeSessionId) {
      args.push("-r", cfg.resumeSessionId);
    }
    if (cfg.dangerouslySkipPermissions) {
      args.push("--always-approve");
    } else if (cfg.approvalMode === "auto") {
      args.push("--permission-mode", "auto");
    }
    // strict / prompt: leave default so the TUI asks for approval interactively.
    if (!cfg.resumeSessionId && cfg.prompt) args.push(cfg.prompt);
    return args;
  },

  envExtras() {
    return {};
  },

  mcpConfigArgs(): string[] {
    return []; // Grok manages MCP via `grok mcp` / settings, not a launch flag.
  },

  effortInArgs(): boolean {
    return false;
  },

  effortSlash(): string | null {
    return null; // Grok's coding models do not expose reasoning effort.
  },

  createTailer(cwd: string, startedAt: number, onPatch: (p: TailPatch) => void): LiveTailer {
    return new GrokTailer(cwd, startedAt, onPatch);
  },

  scanSessions(): ProviderSession[] {
    return scanGrok();
  },
};
