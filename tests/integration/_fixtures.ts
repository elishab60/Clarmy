import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Fixture {
  readonly home: string;
  cleanup(): void;
}

export function makeClaudeHome(opts: {
  settings?: Record<string, unknown>;
  // Contents of the home-root .claude.json (enabled MCP servers live there,
  // not in settings.json; claudeJsonPath() maps it under the fixture home).
  claudeJson?: Record<string, unknown>;
  plugins?: Record<string, { manifest: Record<string, unknown>; skills?: Record<string, string> }>;
  userSkills?: Record<string, string>;
  sessions?: Record<string, string>;
}): Fixture {
  const home = mkdtempSync(join(tmpdir(), "cockpit-test-"));
  mkdirSync(join(home, "plugins", "cache"), { recursive: true });
  if (opts.settings) writeFileSync(join(home, "settings.json"), JSON.stringify(opts.settings, null, 2));
  if (opts.claudeJson) writeFileSync(join(home, ".claude.json"), JSON.stringify(opts.claudeJson, null, 2));
  writeFileSync(join(home, "plugins", "installed_plugins.json"), JSON.stringify({ version: 2, plugins: {} }, null, 2));
  for (const [fullId, p] of Object.entries(opts.plugins ?? {})) {
    const [name, marketplace] = fullId.split("@");
    const dir = join(home, "plugins", "cache", marketplace!, name!, "1.0.0");
    mkdirSync(join(dir, ".claude-plugin"), { recursive: true });
    writeFileSync(join(dir, ".claude-plugin", "plugin.json"), JSON.stringify(p.manifest, null, 2));
    for (const [skillName, body] of Object.entries(p.skills ?? {})) {
      const sdir = join(dir, "skills", skillName);
      mkdirSync(sdir, { recursive: true });
      writeFileSync(join(sdir, "SKILL.md"), body);
    }
  }
  for (const [skillName, body] of Object.entries(opts.userSkills ?? {})) {
    const sdir = join(home, "skills", skillName);
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, "SKILL.md"), body);
  }
  for (const [sessPath, body] of Object.entries(opts.sessions ?? {})) {
    const full = join(home, "projects", sessPath);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  }
  return {
    home,
    cleanup() { /* tmpdir — best-effort, OS cleans */ },
  };
}
