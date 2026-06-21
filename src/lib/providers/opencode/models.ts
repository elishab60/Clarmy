import { spawnSync } from "node:child_process";
import { createLogger } from "../../util/logger.ts";
import { modelsForProvider } from "../../shared/models.ts";
import { findOpenCodeCli } from "./driver.ts";

const log = createLogger("opencode-models");
const TTL_MS = 60_000;

// One selectable opencode model. `apiId` is the "provider/model" string the CLI
// takes via -m and also the cockpit model id (id === apiId for opencode).
export interface OpenCodeModel {
  readonly apiId: string;
  readonly provider: string; // the opencode-side provider, e.g. "opencode", "zai-coding-plan"
  readonly label: string; // the model name (suffix)
}

let cache: { at: number; list: OpenCodeModel[] } | null = null;

// The user's available opencode models = `opencode models` (default + plan +
// whatever is authed). Cached briefly so the new-session picker is snappy.
// Falls back to the static zen catalog when the binary is missing or errors.
export function listOpenCodeModels(): OpenCodeModel[] {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.list;
  const list = discover() ?? fallback();
  cache = { at: now, list };
  return list;
}

function discover(): OpenCodeModel[] | null {
  const cli = findOpenCodeCli();
  if (!cli) return null;
  try {
    const res = spawnSync(cli, ["models"], { encoding: "utf8", timeout: 10_000 });
    if (res.status !== 0 || !res.stdout) return null;
    const models = parseModelLines(res.stdout);
    return models.length > 0 ? models : null;
  } catch (err) {
    log.warn("opencode models discovery failed", { err: String(err) });
    return null;
  }
}

// Each line is "provider/model"; ignore anything else (banners, blanks).
export function parseModelLines(stdout: string): OpenCodeModel[] {
  const out: OpenCodeModel[] = [];
  const seen = new Set<string>();
  for (const raw of stdout.split("\n")) {
    const line = raw.trim();
    const slash = line.indexOf("/");
    if (slash <= 0 || slash === line.length - 1) continue;
    if (/\s/.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push({ apiId: line, provider: line.slice(0, slash), label: line.slice(slash + 1) });
  }
  return out;
}

function fallback(): OpenCodeModel[] {
  return modelsForProvider("opencode").map((m) => {
    const slash = m.apiId.indexOf("/");
    return {
      apiId: m.apiId,
      provider: slash > 0 ? m.apiId.slice(0, slash) : "opencode",
      label: slash > 0 ? m.apiId.slice(slash + 1) : m.apiId,
    };
  });
}
