import { homedir } from "node:os";
import { resolve, join } from "node:path";

// opencode keeps all state in a single SQLite database under its XDG data dir.
// Default ~/.local/share/opencode/opencode.db; honours XDG_DATA_HOME like the
// CLI does, plus an OPENCODE_DATA_DIR override the tests point at a temp dir.
export function opencodeDataDir(): string {
  const override = process.env.OPENCODE_DATA_DIR;
  if (override) return resolve(override);
  const xdg = process.env.XDG_DATA_HOME;
  if (xdg) return join(resolve(xdg), "opencode");
  return resolve(homedir(), ".local/share/opencode");
}

export function opencodeDbPath(): string {
  return join(opencodeDataDir(), "opencode.db");
}

// opencode installs its binary at ~/.opencode/bin/opencode, which is not on the
// standard resolveCliPath search list, so the driver falls back to this.
export function opencodeBinFallback(): string {
  return resolve(homedir(), ".opencode/bin/opencode");
}
