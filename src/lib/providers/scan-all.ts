import { createLogger } from "../util/logger.ts";
import type { ProviderSession } from "./types.ts";
import { allDrivers } from "./registry.ts";

const log = createLogger("provider-scan");

// Historical sessions from every provider, each row already tagged with its
// provider so the metrics layer can keep them strictly separate. A driver that
// throws (e.g. an unreadable home dir) is logged and skipped, never aborting the
// whole scan.
export function scanAllProviders(): ProviderSession[] {
  const out: ProviderSession[] = [];
  for (const d of allDrivers()) {
    try {
      out.push(...d.scanSessions());
    } catch (err) {
      log.warn("provider scan failed", { provider: d.id, err: String(err) });
    }
  }
  return out;
}
