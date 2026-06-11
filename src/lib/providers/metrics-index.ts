import { watch, existsSync, type FSWatcher } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { scanAllProviders } from "./scan-all.ts";
import { refreshPricing } from "../claude-code/pricing.ts";
import { projectsDir } from "../claude-code/paths.ts";
import { codexSessionsDir } from "./codex/paths.ts";
import { geminiHome } from "./gemini/paths.ts";
import { computeRows, type MetricsRow } from "./metrics-rows.ts";
import { createLogger } from "../util/logger.ts";

export type { MetricsRow } from "./metrics-rows.ts";

const log = createLogger("metrics-index");

const DEBOUNCE_MS = 1_500;
const FALLBACK_TTL_MS = 60_000;   // safety net when fs.watch is unavailable
const WORKER_TIMEOUT_MS = 120_000;

// The store is shared across BOTH module graphs (server.ts's node graph and
// Next's compiled route graph) via globalThis, like the SessionManager.
class MetricsIndex {
  private rows: MetricsRow[] | null = null;
  private generatedAt = 0;
  private dirty = true;
  private building: Promise<MetricsRow[]> | null = null;
  private watchers: FSWatcher[] = [];
  private watching = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();

  // Cached rows, rebuilt only when transcripts changed. Concurrent callers
  // share one in-flight build. Stale-while-revalidate: once we have ANY rows,
  // requests never wait on a rebuild; they get the previous snapshot and the
  // WS metrics.dirty push makes clients refetch when the fresh one lands.
  async payload(): Promise<{ generatedAt: number; rows: MetricsRow[] }> {
    const stale = !this.watching && Date.now() - this.generatedAt > FALLBACK_TTL_MS;
    if (this.rows && !this.dirty && !stale) {
      return { generatedAt: this.generatedAt, rows: this.rows };
    }
    if (!this.building) {
      this.building = this.build().finally(() => { this.building = null; });
    }
    if (this.rows) {
      return { generatedAt: this.generatedAt, rows: this.rows };
    }
    const rows = await this.building;
    return { generatedAt: this.generatedAt, rows };
  }

  // Notify when the index went dirty (debounced); ws-server fans this out so
  // clients refetch instead of polling.
  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // Recursive fs.watch on every provider's transcript root. macOS and Windows
  // support recursive natively; on platforms that throw we fall back to the
  // payload() TTL. Never crashes the server.
  startWatching(): void {
    if (this.watching) return;
    const roots = [projectsDir(), codexSessionsDir(), geminiHome()];
    for (const root of roots) {
      try {
        const w = watch(root, { recursive: true, persistent: false }, (_e, file) => {
          if (file && !String(file).endsWith(".jsonl") && !String(file).endsWith(".json")) return;
          this.markDirty();
        });
        w.on("error", (err) => log.warn("watcher error", { root, err: String(err) }));
        this.watchers.push(w);
      } catch (err) {
        log.warn("fs.watch unavailable; falling back to TTL", { root, err: String(err) });
      }
    }
    this.watching = this.watchers.length > 0;
    log.info("metrics index watching", { roots: this.watchers.length });
  }

  stopWatching(): void {
    for (const w of this.watchers) { try { w.close(); } catch { /* ignore */ } }
    this.watchers = [];
    this.watching = false;
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null; }
  }

  private markDirty(): void {
    this.dirty = true;
    if (this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      // Rebuild proactively so the next request is served hot, then notify.
      void this.payload().then(() => {
        for (const cb of this.listeners) { try { cb(); } catch { /* listener owns its errors */ } }
      });
    }, DEBOUNCE_MS);
  }

  private async build(): Promise<MetricsRow[]> {
    const t0 = Date.now();
    let rows: MetricsRow[];
    let via = "worker";
    try {
      rows = await buildInWorker();
    } catch (err) {
      // The scanners are synchronous; this blocks the loop for the duration of
      // the scan, so the worker is strongly preferred. Keep the fallback so a
      // broken worker path degrades to slow, never to broken.
      via = "sync";
      log.warn("worker build failed; building inline", { err: String(err) });
      await refreshPricing().catch(() => { /* fallback table */ });
      rows = computeRows(scanAllProviders());
    }
    this.rows = rows;
    this.generatedAt = Date.now();
    this.dirty = false;
    log.info("metrics index rebuilt", { rows: rows.length, ms: Date.now() - t0, via });
    return rows;
  }
}

// Spawn the build in a worker thread so the synchronous transcript scan never
// blocks the event loop. The worker file is resolved from the repo root (the
// process always boots from there via server.ts / bin/clarmy), not via
// import.meta.url, which would point inside Next's compiled bundle.
function buildInWorker(): Promise<MetricsRow[]> {
  const entry = join(process.cwd(), "src", "lib", "providers", "metrics-build-worker.ts");
  if (!existsSync(entry)) return Promise.reject(new Error(`worker entry missing: ${entry}`));
  return new Promise((resolve, reject) => {
    const w = new Worker(entry);
    const timer = setTimeout(() => {
      void w.terminate();
      reject(new Error("worker build timed out"));
    }, WORKER_TIMEOUT_MS);
    w.once("message", (msg: { ok: boolean; rows?: MetricsRow[]; error?: string }) => {
      clearTimeout(timer);
      void w.terminate();
      if (msg.ok && msg.rows) resolve(msg.rows);
      else reject(new Error(msg.error ?? "worker build failed"));
    });
    w.once("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

interface Holder { __cockpitMetricsIndex?: MetricsIndex }

export function getMetricsIndex(): MetricsIndex {
  const g = globalThis as unknown as Holder;
  if (!g.__cockpitMetricsIndex) g.__cockpitMetricsIndex = new MetricsIndex();
  return g.__cockpitMetricsIndex;
}
