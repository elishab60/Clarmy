import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { settingsPath } from "./paths.ts";

export interface McpServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly transport?: "stdio" | "sse" | "websocket";
  readonly timeoutMs?: number;
}

export interface McpServersView {
  readonly enabled: Record<string, McpServerConfig>;
  readonly disabled: Record<string, McpServerConfig>;
}

type Settings = {
  mcpServers?: Record<string, McpServerConfig>;
  cockpit?: { disabledMcpServers?: Record<string, McpServerConfig> };
  [k: string]: unknown;
};

export function settingsFilePath(): string {
  return settingsPath();
}

function readRaw(): Settings {
  try {
    const txt = readFileSync(settingsPath(), "utf8");
    return JSON.parse(txt) as Settings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function writeRaw(s: Settings): void {
  const tmp = settingsPath() + ".cockpit.tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", "utf8");
  renameSync(tmp, settingsPath());
}

export function readMcpServers(): McpServersView {
  const s = readRaw();
  return {
    enabled: s.mcpServers ?? {},
    disabled: s.cockpit?.disabledMcpServers ?? {},
  };
}

export function toggleMcpServer(name: string): { enabled: boolean } {
  const s = readRaw();
  const enabled = s.mcpServers ?? {};
  const cockpit = s.cockpit ?? {};
  const disabled = cockpit.disabledMcpServers ?? {};
  if (enabled[name]) {
    disabled[name] = enabled[name]!;
    delete enabled[name];
    s.mcpServers = enabled;
    s.cockpit = { ...cockpit, disabledMcpServers: disabled };
    writeRaw(s);
    return { enabled: false };
  }
  if (disabled[name]) {
    enabled[name] = disabled[name]!;
    delete disabled[name];
    s.mcpServers = enabled;
    s.cockpit = { ...cockpit, disabledMcpServers: disabled };
    writeRaw(s);
    return { enabled: true };
  }
  throw new Error(`server ${name} not found`);
}

export function addMcpServer(
  name: string,
  cfg: McpServerConfig,
  opts?: { overwrite?: boolean },
): void {
  const s = readRaw();
  const enabled = s.mcpServers ?? {};
  const disabled = s.cockpit?.disabledMcpServers ?? {};
  if ((enabled[name] || disabled[name]) && !opts?.overwrite) {
    throw Object.assign(new Error(`server ${name} already exists`), { code: "EEXIST" });
  }
  delete disabled[name];
  enabled[name] = cfg;
  s.mcpServers = enabled;
  s.cockpit = { ...(s.cockpit ?? {}), disabledMcpServers: disabled };
  writeRaw(s);
}

export function removeMcpServer(name: string): void {
  const s = readRaw();
  const enabled = s.mcpServers ?? {};
  const disabled = s.cockpit?.disabledMcpServers ?? {};
  delete enabled[name];
  delete disabled[name];
  s.mcpServers = enabled;
  s.cockpit = { ...(s.cockpit ?? {}), disabledMcpServers: disabled };
  writeRaw(s);
}

export function importMcpServers(
  payload: { mcpServers: Record<string, McpServerConfig> },
  opts?: { overwrite?: boolean },
): { added: string[]; skipped: string[] } {
  const added: string[] = [];
  const skipped: string[] = [];
  for (const [name, cfg] of Object.entries(payload.mcpServers)) {
    try {
      addMcpServer(name, cfg, opts);
      added.push(name);
    } catch {
      skipped.push(name);
    }
  }
  return { added, skipped };
}
