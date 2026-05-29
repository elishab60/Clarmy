import { randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cockpitDir } from "../claude-code/paths.ts";
import { role, orchestratorPort, orchestratorUrl } from "../orchestrator/role.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("mcp.config");

export const SESSION_HEADER = "x-cockpit-session";
export const KEY_HEADER = "x-cockpit-mcp-key";
const SERVER_NAME = "cockpit";

// Shared secret checked on every MCP request. Stable for the process lifetime so
// a config file written at spawn stays valid. Provide COCKPIT_MCP_KEY to pin it
// across restarts (otherwise resumed sessions would carry a stale key).
let cachedKey: string | null = null;
export function mcpKey(): string {
  if (cachedKey) return cachedKey;
  cachedKey = process.env.COCKPIT_MCP_KEY ?? randomBytes(24).toString("hex");
  return cachedKey;
}

// The loopback URL a child claude process uses to reach the MCP server. The
// child is a subprocess of the manager-owning process, so 127.0.0.1 + that
// process's port always resolves. solo serves it as a Next route; the daemon
// serves it on its control port.
export function mcpEndpointUrl(): string {
  if (role() === "orchestrator") {
    return `http://127.0.0.1:${orchestratorPort()}/mcp`;
  }
  // app role does not spawn PTYs today (the daemon does), so this branch is a
  // safety net: a child of the app process reaches the daemon over the compose
  // network, not the local Next route, since the manager and bus live there.
  if (role() === "app") {
    return `${orchestratorUrl().replace(/\/$/, "")}/mcp`;
  }
  const port = Number(process.env.COCKPIT_PORT ?? process.env.PORT ?? 3010);
  return `http://127.0.0.1:${port}/api/mcp-bridge`;
}

interface HttpMcpEntry {
  readonly type: "http";
  readonly url: string;
  readonly headers: Record<string, string>;
}

export function buildSessionMcpConfig(sessionId: string): { mcpServers: Record<string, HttpMcpEntry> } {
  const entry: HttpMcpEntry = {
    type: "http",
    url: mcpEndpointUrl(),
    headers: {
      [SESSION_HEADER]: sessionId,
      [KEY_HEADER]: mcpKey(),
    },
  };
  return { mcpServers: { [SERVER_NAME]: entry } };
}

function configDir(): string {
  return join(cockpitDir(), "mcp");
}

export function sessionConfigPath(sessionId: string): string {
  return join(configDir(), `${sessionId}.json`);
}

// Write the per-session config (mode 600 so the key stays off other users and
// out of `ps`). Returns the path, or null if writing failed (spawn still works,
// just without cockpit tools).
export function writeSessionMcpConfig(sessionId: string): string | null {
  try {
    mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    const path = sessionConfigPath(sessionId);
    const body = JSON.stringify(buildSessionMcpConfig(sessionId), null, 2) + "\n";
    writeFileSync(path, body, { encoding: "utf8", mode: 0o600 });
    return path;
  } catch (err) {
    log.warn("failed to write session mcp config", { sessionId, err: String(err) });
    return null;
  }
}

export function removeSessionMcpConfig(sessionId: string): void {
  try {
    rmSync(sessionConfigPath(sessionId), { force: true });
  } catch (err) {
    log.warn("failed to remove session mcp config", { sessionId, err: String(err) });
  }
}

// argv fragment to merge our server into the session's MCP config without
// disabling the user's own servers (no --strict-mcp-config).
export function mcpConfigArgs(sessionId: string): string[] {
  const path = writeSessionMcpConfig(sessionId);
  return path ? ["--mcp-config", path] : [];
}
