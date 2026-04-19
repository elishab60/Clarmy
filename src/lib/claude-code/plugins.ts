import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { settingsPath, pluginsCacheDir } from "./paths.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-plugins");

export interface PluginInfo {
  readonly id: string;
  readonly name: string;
  readonly marketplace: string;
  readonly version: string;
  readonly cachePath: string;
  readonly manifestPath: string;
  readonly description?: string;
  readonly enabled: boolean;
}

function readEnabledMap(): Record<string, boolean> {
  try {
    const raw = readFileSync(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as { enabledPlugins?: Record<string, boolean> };
    return parsed.enabledPlugins ?? {};
  } catch { return {}; }
}

export function scanInstalledPlugins(): PluginInfo[] {
  const enabled = readEnabledMap();
  const out: PluginInfo[] = [];
  let marketplaces: string[];
  try { marketplaces = readdirSync(pluginsCacheDir()); } catch { return []; }
  for (const mp of marketplaces) {
    if (mp.startsWith(".")) continue;
    const mpDir = join(pluginsCacheDir(), mp);
    let pluginNames: string[];
    try { pluginNames = readdirSync(mpDir); } catch { continue; }
    for (const name of pluginNames) {
      if (name.startsWith(".")) continue;
      const nameDir = join(mpDir, name);
      let versions: string[];
      try { versions = readdirSync(nameDir).sort(); } catch { continue; }
      const picked = versions.find((v) => {
        try { return statSync(join(nameDir, v, ".claude-plugin", "plugin.json")).isFile(); } catch { return false; }
      });
      if (!picked) continue;
      const cachePath = join(nameDir, picked);
      const manifestPath = join(cachePath, ".claude-plugin", "plugin.json");
      let manifest: Record<string, unknown> = {};
      try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>; }
      catch (err) { log.error("manifest parse failed", { manifestPath, err: String(err) }); continue; }
      const id = `${name}@${mp}`;
      out.push({
        id,
        name,
        marketplace: mp,
        version: typeof manifest.version === "string" ? manifest.version : picked,
        cachePath,
        manifestPath,
        description: typeof manifest.description === "string" ? manifest.description : undefined,
        enabled: enabled[id] === true,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
