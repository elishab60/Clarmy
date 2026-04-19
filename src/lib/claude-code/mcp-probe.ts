import { spawn } from "node:child_process";
import type { McpServerConfig } from "./mcp-config.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-mcp-probe");

export interface ProbeResult {
  readonly ok: boolean;
  readonly tools: readonly string[];
  readonly latencyMs: number;
  readonly error?: string;
  readonly skipped?: boolean;
  readonly reason?: string;
}

const cache = new Map<string, { res: ProbeResult; exp: number }>();
const CACHE_MS = 30_000;

export async function probeMcpServer(
  name: string,
  cfg: McpServerConfig,
  opts?: { timeoutMs?: number; bypassCache?: boolean },
): Promise<ProbeResult> {
  if (!opts?.bypassCache) {
    const c = cache.get(name);
    if (c && c.exp > Date.now()) return c.res;
  }
  if (cfg.transport && cfg.transport !== "stdio") {
    const res: ProbeResult = {
      ok: false,
      tools: [],
      latencyMs: 0,
      skipped: true,
      reason: `transport ${cfg.transport} not supported for test`,
    };
    cache.set(name, { res, exp: Date.now() + CACHE_MS });
    return res;
  }
  const timeout = opts?.timeoutMs ?? 5_000;
  const start = performance.now();
  return await new Promise<ProbeResult>((resolve) => {
    let resolved = false;
    const finish = (r: ProbeResult): void => {
      if (resolved) return;
      resolved = true;
      cache.set(name, { res: r, exp: Date.now() + CACHE_MS });
      try {
        child.kill("SIGKILL");
      } catch {
        /* */
      }
      resolve(r);
    };
    const child = spawn(cfg.command, [...(cfg.args ?? [])], {
      env: { ...process.env, ...(cfg.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "";
    const tools: string[] = [];
    let initialized = false;
    const to = setTimeout(
      () => finish({ ok: false, tools: [], latencyMs: performance.now() - start, error: "timeout" }),
      timeout,
    );
    to.unref();
    child.on("error", (err) => {
      clearTimeout(to);
      finish({ ok: false, tools: [], latencyMs: performance.now() - start, error: String(err) });
    });
    child.stderr.on("data", (d) => log.debug("stderr", { name, chunk: String(d).slice(0, 200) }));
    child.stdout.on("data", (d) => {
      buf += String(d);
      let idx: number;
      while ((idx = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let rec: Record<string, unknown>;
        try {
          rec = JSON.parse(line) as Record<string, unknown>;
        } catch {
          continue;
        }
        const result = rec.result as Record<string, unknown> | undefined;
        if (!initialized && result) {
          initialized = true;
          const caps = result.capabilities as Record<string, unknown> | undefined;
          const declTools = caps?.tools;
          child.stdin.write(
            JSON.stringify({ jsonrpc: "2.0", id: 2, method: "notifications/initialized" }) + "\n",
          );
          if (declTools) {
            child.stdin.write(
              JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list" }) + "\n",
            );
          } else {
            clearTimeout(to);
            finish({ ok: true, tools: [], latencyMs: performance.now() - start });
          }
        } else if (initialized && result && Array.isArray(result.tools)) {
          for (const t of result.tools as Array<Record<string, unknown>>) {
            if (typeof t.name === "string") tools.push(t.name);
          }
          clearTimeout(to);
          finish({ ok: true, tools, latencyMs: performance.now() - start });
        }
      }
    });
    child.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "cockpit", version: "0.1.0" },
        },
      }) + "\n",
    );
  });
}
