import { parentPort } from "node:worker_threads";
import { refreshPricing } from "../claude-code/pricing.ts";
import { scanAll, aggregateUsage } from "../claude-code/history.ts";
import { scanAllProviders } from "./scan-all.ts";
import { computeRows } from "./metrics-rows.ts";

// Long-lived worker for metrics index builds. The transcript scanners are
// synchronous (readFileSync loops over hundreds of files), so running them on
// the main thread would freeze every request; here they block this worker
// instead. The worker is PERSISTENT on purpose: the scanners keep per-file
// mtime caches in module state, so the first build is a cold full parse and
// every later build only re-reads files that actually changed.
interface BuildMsg { readonly type: "build"; readonly seq: number }

parentPort?.on("message", (msg: BuildMsg) => {
  if (!msg || msg.type !== "build") return;
  void (async () => {
    try {
      await refreshPricing().catch(() => { /* fallback price table */ });
      const rows = computeRows(scanAllProviders());
      // Light claude sessions for /api/history and /api/projects: same scan
      // (the call below is a pure cache read after scanAllProviders), usage
      // records stripped to keep the structured-clone payload small.
      const full = scanAll();
      const sessions = full.map(({ usage: _usage, ...rest }) => rest);
      // Per-cwd token aggregates for /api/projects (needs the usage records,
      // which never leave the worker).
      const perCwd = [...aggregateUsage(full).perCwd.entries()];
      parentPort?.postMessage({ seq: msg.seq, ok: true, rows, sessions, perCwd });
    } catch (err) {
      parentPort?.postMessage({ seq: msg.seq, ok: false, error: String(err) });
    }
  })();
});
