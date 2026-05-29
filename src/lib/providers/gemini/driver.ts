import type { SpawnConfig } from "../../shared/types.ts";
import { apiIdFor } from "../../shared/models.ts";
import { resolveCliPath } from "../cli-path.ts";
import type { CliDriver, LiveTailer, ProviderSession, TailPatch } from "../types.ts";
import { GeminiTailer } from "./tailer.ts";
import { scanGemini } from "./history.ts";

// Gemini is driven interactively: the prompt is passed via -i / --prompt-
// interactive (runs it, then keeps the session open), the model via -m, and
// tool approval via --approval-mode / --yolo. Gemini exposes no reasoning-effort
// CLI flag, so effort is always absent for its models.
export const geminiDriver: CliDriver = {
  id: "gemini",
  promptDelivery: "arg",

  findCli() {
    return resolveCliPath("gemini", process.env.GEMINI_CLI_PATH);
  },

  buildArgs(cfg: SpawnConfig): string[] {
    // Cockpit is the controlled environment, so trust the workspace up front:
    // headless Gemini otherwise refuses to start in an "untrusted" directory.
    const args: string[] = ["--skip-trust"];
    const model = apiIdFor(cfg.model);
    if (model) args.push("-m", model);
    if (cfg.resumeSessionId) {
      args.push("--resume", cfg.resumeSessionId);
    } else if (cfg.prompt) {
      args.push("-i", cfg.prompt);
    }
    if (cfg.dangerouslySkipPermissions) args.push("--yolo");
    else if (cfg.approvalMode === "auto") args.push("--approval-mode", "yolo");
    // prompt / strict: leave default so the TUI asks for approval interactively.
    return args;
  },

  envExtras() {
    return {};
  },

  effortInArgs(): boolean {
    return false;
  },

  effortSlash(): string | null {
    return null; // Gemini has no reasoning-effort control on the CLI.
  },

  createTailer(cwd: string, startedAt: number, onPatch: (p: TailPatch) => void): LiveTailer {
    return new GeminiTailer(cwd, startedAt, onPatch);
  },

  scanSessions(): ProviderSession[] {
    return scanGemini();
  },
};
