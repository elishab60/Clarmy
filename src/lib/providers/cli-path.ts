import { statSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";

// Resolve a vendor CLI binary. Honours an explicit env override first, then the
// usual install locations. Returns the first path that is a real file.
export function resolveCliPath(binary: string, envOverride: string | undefined): string | null {
  const candidates = [
    envOverride,
    resolve(homedir(), ".local/bin", binary),
    `/usr/local/bin/${binary}`,
    `/opt/homebrew/bin/${binary}`,
    `/usr/bin/${binary}`,
  ].filter((x): x is string => !!x);
  for (const c of candidates) {
    try { if (statSync(c).isFile()) return c; } catch { /* skip */ }
  }
  return null;
}
