import { parentPort } from "node:worker_threads";
import { refreshPricing } from "../claude-code/pricing.ts";
import { scanAllProviders } from "./scan-all.ts";
import { computeRows } from "./metrics-rows.ts";

// Worker entry for the metrics index build. The transcript scanners are
// synchronous (readFileSync loops over hundreds of files), so running them on
// the main thread would freeze every request for seconds on a cold scan.
// Here they block this worker instead; the main loop stays responsive.
async function run(): Promise<void> {
  await refreshPricing().catch(() => { /* fallback price table */ });
  const rows = computeRows(scanAllProviders());
  parentPort?.postMessage({ ok: true, rows });
}

run().catch((err) => {
  parentPort?.postMessage({ ok: false, error: String(err) });
});
