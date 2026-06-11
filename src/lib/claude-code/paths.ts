import { homedir } from "node:os";
import { resolve, join } from "node:path";

export function claudeHome(): string {
  return process.env.COCKPIT_CLAUDE_HOME ?? resolve(homedir(), ".claude");
}

export function settingsPath(): string { return join(claudeHome(), "settings.json"); }
// ~/.claude.json lives in the HOME ROOT (not under ~/.claude). When the test
// override is active, treat the override dir as the home root so tests never
// read or, worse, write the developer's real ~/.claude.json.
export function claudeJsonPath(): string {
  const override = process.env.COCKPIT_CLAUDE_HOME;
  return override ? join(override, ".claude.json") : join(homedir(), ".claude.json");
}
export function pluginsCacheDir(): string { return join(claudeHome(), "plugins", "cache"); }
export function installedPluginsPath(): string { return join(claudeHome(), "plugins", "installed_plugins.json"); }
export function userSkillsDir(): string { return join(claudeHome(), "skills"); }
export function userAgentsDir(): string { return join(claudeHome(), "agents"); }
export function projectAgentsDir(cwd: string): string { return join(cwd, ".claude", "agents"); }
export function projectsDir(): string { return join(claudeHome(), "projects"); }
export function debugDir(): string { return join(claudeHome(), "debug"); }
export function cockpitDir(): string { return join(claudeHome(), "cockpit"); }
export function cronsFile(): string { return join(cockpitDir(), "crons.json"); }
export function sessionsFile(): string { return join(cockpitDir(), "sessions.json"); }
export function secretsFile(): string { return join(cockpitDir(), "secrets.json"); }
export function secretKeyFile(): string { return join(cockpitDir(), "secret.key"); }
