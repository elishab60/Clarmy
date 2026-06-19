import { statSync } from "node:fs";
import type { SpawnConfig } from "../../shared/types.ts";
import { apiIdFor } from "../../shared/models.ts";
import { resolveCliPath } from "../cli-path.ts";
import type { CliDriver, LiveTailer, ProviderSession, TailPatch } from "../types.ts";
import { opencodeBinFallback } from "./paths.ts";
import { OpenCodeTailer } from "./tailer.ts";
import { scanOpenCode } from "./history.ts";

// Resolve the opencode binary. Beyond the usual locations, opencode's own
// installer drops it at ~/.opencode/bin/opencode, which is not on the standard
// search list, so we fall back to that.
export function findOpenCodeCli(): string | null {
  const found = resolveCliPath("opencode", process.env.OPENCODE_CLI_PATH);
  if (found) return found;
  const fallback = opencodeBinFallback();
  try { if (statSync(fallback).isFile()) return fallback; } catch { /* not there */ }
  return null;
}

// opencode is driven as its interactive TUI (the default command): the prompt is
// seeded with --prompt and the model via `-m provider/model`. opencode routes to
// many models so the model id IS the api id ("provider/model") and passes straight
// through. Resume re-opens a prior session by id with -s. The default TUI command
// only accepts -m/--prompt/-s/--agent (NOT --dangerously-skip-permissions, which
// is a `run`-only flag and makes the TUI bail to its usage screen), so permission
// handling is left to opencode's own TUI / config. Reasoning effort (opencode's
// --variant) is likewise not wired yet.
export const opencodeDriver: CliDriver = {
  id: "opencode",
  promptDelivery: "arg",

  findCli() {
    return findOpenCodeCli();
  },

  buildArgs(cfg: SpawnConfig): string[] {
    const args: string[] = [];
    const model = apiIdFor(cfg.model) ?? cfg.model;
    if (model) args.push("-m", model);
    if (cfg.resumeSessionId) args.push("-s", cfg.resumeSessionId);
    if (!cfg.resumeSessionId && cfg.prompt) args.push("--prompt", cfg.prompt);
    return args;
  },

  envExtras() {
    return {};
  },

  mcpConfigArgs(): string[] {
    return []; // opencode manages MCP via `opencode mcp` / config, not a launch flag.
  },

  effortInArgs(): boolean {
    return false;
  },

  effortSlash(): string | null {
    return null; // opencode's --variant effort is not wired yet.
  },

  createTailer(cwd: string, startedAt: number, onPatch: (p: TailPatch) => void): LiveTailer {
    return new OpenCodeTailer(cwd, startedAt, onPatch);
  },

  scanSessions(): ProviderSession[] {
    return scanOpenCode();
  },
};
