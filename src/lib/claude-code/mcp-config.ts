import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { settingsPath, claudeJsonPath } from "./paths.ts";

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

type ClaudeJson = {
  mcpServers?: Record<string, McpServerConfig>;
  [k: string]: unknown;
};

type Settings = {
  cockpit?: { disabledMcpServers?: Record<string, McpServerConfig> };
  [k: string]: unknown;
};

export function settingsFilePath(): string {
  return settingsPath();
}

function readClaudeJson(): ClaudeJson {
  try {
    return JSON.parse(readFileSync(claudeJsonPath(), "utf8")) as ClaudeJson;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function writeClaudeJson(d: ClaudeJson): void {
  const tmp = claudeJsonPath() + ".cockpit.tmp";
  writeFileSync(tmp, JSON.stringify(d, null, 2) + "\n", "utf8");
  renameSync(tmp, claudeJsonPath());
}

function readSettings(): Settings {
  try {
    return JSON.parse(readFileSync(settingsPath(), "utf8")) as Settings;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

function writeSettings(s: Settings): void {
  const tmp = settingsPath() + ".cockpit.tmp";
  writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", "utf8");
  renameSync(tmp, settingsPath());
}

export function readMcpServers(): McpServersView {
  const cj = readClaudeJson();
  const s = readSettings();
  return {
    enabled: cj.mcpServers ?? {},
    disabled: s.cockpit?.disabledMcpServers ?? {},
  };
}

export function toggleMcpServer(name: string): { enabled: boolean } {
  const cj = readClaudeJson();
  const s = readSettings();
  const enabled = cj.mcpServers ?? {};
  const cockpit = s.cockpit ?? {};
  const disabled = cockpit.disabledMcpServers ?? {};

  if (enabled[name]) {
    disabled[name] = enabled[name]!;
    delete enabled[name];
    cj.mcpServers = enabled;
    writeClaudeJson(cj);
    s.cockpit = { ...cockpit, disabledMcpServers: disabled };
    writeSettings(s);
    return { enabled: false };
  }
  if (disabled[name]) {
    enabled[name] = disabled[name]!;
    delete disabled[name];
    cj.mcpServers = enabled;
    writeClaudeJson(cj);
    s.cockpit = { ...cockpit, disabledMcpServers: disabled };
    writeSettings(s);
    return { enabled: true };
  }
  throw new Error(`server ${name} not found`);
}

export function addMcpServer(
  name: string,
  cfg: McpServerConfig,
  opts?: { overwrite?: boolean },
): void {
  const cj = readClaudeJson();
  const s = readSettings();
  const enabled = cj.mcpServers ?? {};
  const disabled = s.cockpit?.disabledMcpServers ?? {};
  if ((enabled[name] || disabled[name]) && !opts?.overwrite) {
    throw Object.assign(new Error(`server ${name} already exists`), { code: "EEXIST" });
  }
  delete disabled[name];
  enabled[name] = cfg;
  cj.mcpServers = enabled;
  writeClaudeJson(cj);
  s.cockpit = { ...(s.cockpit ?? {}), disabledMcpServers: disabled };
  writeSettings(s);
}

export function removeMcpServer(name: string): void {
  const cj = readClaudeJson();
  const s = readSettings();
  const enabled = cj.mcpServers ?? {};
  const disabled = s.cockpit?.disabledMcpServers ?? {};
  delete enabled[name];
  delete disabled[name];
  cj.mcpServers = enabled;
  writeClaudeJson(cj);
  s.cockpit = { ...(s.cockpit ?? {}), disabledMcpServers: disabled };
  writeSettings(s);
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
