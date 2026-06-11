import { watch, type FSWatcher } from "node:fs";
import { scanAllProviders } from "./scan-all.ts";
import { estimateCost, refreshPricing } from "../claude-code/pricing.ts";
import { projectsDir } from "../claude-code/paths.ts";
import { codexSessionsDir } from "./codex/paths.ts";
import { geminiHome } from "./gemini/paths.ts";
import { modelFromApiId } from "../shared/models.ts";
import type { ProviderId } from "../shared/providers.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("metrics-index");

// One compact row per recorded session, the expensive half of /api/metrics
// (tree walk + per-record dedup + pricing). Shape matches the client's
// SessionRow exactly.
export interface MetricsRow {
  readonly id: string;
  readonly provider: ProviderId;
  readonly cwd: string;
  readonly project: string;
  readonly model: string;
  readonly rawModel: string | null;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly day: string | null;
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreate: number;
  readonly toolUses: number;
  readonly messages: number;
  readonly cost: number;
  readonly state: "done" | "error" | "ongoing";
  readonly daily: Record<string, { c: number; o: number }>;
}

const DEBOUNCE_MS = 1_500;
const FALLBACK_TTL_MS = 60_000; // safety net when fs.watch is unavailable

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
  // share one in-flight build.
  async payload(): Promise<{ generatedAt: number; rows: MetricsRow[] }> {
    const stale = !this.watching && Date.now() - this.generatedAt > FALLBACK_TTL_MS;
    if (this.rows && !this.dirty && !stale) {
      return { generatedAt: this.generatedAt, rows: this.rows };
    }
    if (!this.building) {
      this.building = this.build().finally(() => { this.building = null; });
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
    await refreshPricing().catch(() => { /* fallback table */ });
    const sessions = scanAllProviders();
    const seen = new Set<string>();
    const rows = sessions.map((s) => {
      let cost = 0, input = 0, output = 0, cacheRead = 0, cacheCreate = 0;
      const daily: Record<string, { c: number; o: number }> = {};
      for (const r of s.usage) {
        if (r.key) {
          const dedupKey = `${s.provider}:${r.key}`;
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
        }
        input += r.inputTokens;
        output += r.outputTokens;
        cacheRead += r.cacheReadTokens;
        cacheCreate += r.cacheCreate5mTokens + r.cacheCreate1hTokens;
        const rc = estimateCost(r.model ?? s.model, {
          input: r.inputTokens,
          output: r.outputTokens,
          cacheRead: r.cacheReadTokens,
          cacheCreate5m: r.cacheCreate5mTokens,
          cacheCreate1h: r.cacheCreate1hTokens,
        });
        cost += rc;
        if (r.ts) {
          const dk = new Date(r.ts).toISOString().slice(0, 10);
          const e = (daily[dk] ??= { c: 0, o: 0 });
          e.c += rc;
          e.o += r.outputTokens;
        }
      }
      const endedAt = s.endedAt || s.startedAt;
      return {
        id: s.id,
        provider: s.provider,
        cwd: s.cwd,
        project: s.project,
        model: modelFromApiId(s.model ?? null) ?? s.model ?? "unknown",
        rawModel: s.model ?? null,
        startedAt: s.startedAt,
        endedAt,
        day: endedAt ? new Date(endedAt).toISOString().slice(0, 10) : null,
        input,
        output,
        cacheRead,
        cacheCreate,
        toolUses: s.toolUses,
        messages: s.messageCount,
        cost,
        state: s.state,
        daily,
      };
    });
    this.rows = rows;
    this.generatedAt = Date.now();
    this.dirty = false;
    log.info("metrics index rebuilt", { rows: rows.length, ms: Date.now() - t0 });
    return rows;
  }
}

interface Holder { __cockpitMetricsIndex?: MetricsIndex }

export function getMetricsIndex(): MetricsIndex {
  const g = globalThis as unknown as Holder;
  if (!g.__cockpitMetricsIndex) g.__cockpitMetricsIndex = new MetricsIndex();
  return g.__cockpitMetricsIndex;
}
