import { statSync } from "node:fs";
import { join } from "node:path";
import { createLogger } from "../../util/logger.ts";
import type { LiveTailer, TailPatch } from "../types.ts";
import { geminiTmpDir, projectHash, listProjectDirs, logsFile } from "./paths.ts";
import { readGeminiLogs } from "./logs.ts";

const log = createLogger("gemini-tailer");
const POLL_MS = 2_000;

// Gemini's on-disk transcript (logs.json) records only user messages: no token
// counts, no tool calls. So this tailer surfaces what it honestly can, the
// resumable session id, and leaves cost/tokens/tools at zero. (Token usage is
// only emitted on Gemini's headless --output-format json stdout or via its
// OpenTelemetry export, neither of which the interactive TUI writes to disk.)
export class GeminiTailer implements LiveTailer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private resumeSessionId: string | undefined;

  constructor(
    private readonly cwd: string,
    private readonly startedAt: number,
    private readonly onPatch: (p: TailPatch) => void,
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), POLL_MS);
    this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (this.stopped) return;
    const file = this.findLogsFile();
    if (!file) return;
    const records = readGeminiLogs(file);
    if (records.length === 0) return;
    const sid = records[records.length - 1]?.sessionId;
    if (sid && sid !== this.resumeSessionId) {
      this.resumeSessionId = sid;
      log.info("gemini tailer session", { sid });
      this.onPatch({ resumeSessionId: sid });
    }
  }

  // Prefer the dir whose name is SHA-256(cwd); fall back to the newest project
  // dir touched at/after our start time.
  private findLogsFile(): string | null {
    const direct = join(geminiTmpDir(), projectHash(this.cwd));
    try { if (statSync(direct).isDirectory()) return logsFile(direct); } catch { /* fall back */ }
    const dirs = listProjectDirs()
      .filter((d) => d.mtimeMs >= this.startedAt - 60_000)
      .sort((a, b) => b.mtimeMs - a.mtimeMs);
    const best = dirs[0];
    return best ? logsFile(best.path) : null;
  }
}
