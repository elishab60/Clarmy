import type { Effort, SpawnConfig } from "../../shared/types.ts";
import { apiIdFor } from "../../shared/models.ts";
import { resolveCliPath } from "../cli-path.ts";
import type { CliDriver, LiveTailer, ProviderSession, TailPatch } from "../types.ts";
import { CodexTailer } from "./tailer.ts";
import { scanCodex } from "./history.ts";

// Codex is driven as its interactive TUI: the prompt is passed as a positional
// arg (we do not type into its TUI), model via -m, reasoning effort via the
// generic `-c model_reasoning_effort=<level>` config override, and approval +
// sandbox via --ask-for-approval / --sandbox (or a full bypass when the user
// opts into skip-perms). Resume re-opens a prior conversation by id.
export const codexDriver: CliDriver = {
  id: "codex",
  promptDelivery: "arg",

  findCli() {
    return resolveCliPath("codex", process.env.CODEX_CLI_PATH);
  },

  buildArgs(cfg: SpawnConfig, effort: Effort | null): string[] {
    if (cfg.resumeSessionId) return ["resume", cfg.resumeSessionId];
    const args: string[] = [];
    const model = apiIdFor(cfg.model);
    if (model) args.push("-m", model);
    if (effort) args.push("-c", `model_reasoning_effort=${effort}`);
    if (cfg.dangerouslySkipPermissions) {
      args.push("--dangerously-bypass-approvals-and-sandbox");
    } else if (cfg.approvalMode === "auto") {
      args.push("--ask-for-approval", "never", "--sandbox", "workspace-write");
    } else if (cfg.approvalMode === "strict") {
      args.push("--ask-for-approval", "untrusted", "--sandbox", "workspace-write");
    } else {
      args.push("--ask-for-approval", "on-request", "--sandbox", "workspace-write");
    }
    if (cfg.prompt) args.push(cfg.prompt);
    return args;
  },

  envExtras() {
    return {};
  },

  effortInArgs(): boolean {
    return true;
  },

  effortSlash(): string | null {
    return null; // Codex cannot change reasoning effort on a live session.
  },

  createTailer(cwd: string, startedAt: number, onPatch: (p: TailPatch) => void): LiveTailer {
    return new CodexTailer(cwd, startedAt, onPatch);
  },

  scanSessions(): ProviderSession[] {
    return scanCodex();
  },
};
