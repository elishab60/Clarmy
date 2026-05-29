"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import type { CronJob } from "@/lib/shared/cron-types";
import { CronDetail } from "./crons/cron-detail";
import { CronCreateModal } from "./crons/cron-create-modal";

type Tab = "all" | "enabled" | "recurring" | "oneshot";

const TABS: { k: Tab; label: string; hint: string }[] = [
  { k: "all", label: "All", hint: "Every cron" },
  { k: "enabled", label: "Enabled", hint: "Active crons only" },
  { k: "recurring", label: "Recurring", hint: "Periodic crons" },
  { k: "oneshot", label: "One-shot", hint: "Fire-once crons" },
];

interface Totals { total: number; enabled: number; recurring: number; oneshot: number }

export function CronsPage() {
  const [crons, setCrons] = useState<CronJob[]>([]);
  const [totals, setTotals] = useState<Totals>({ total: 0, enabled: 0, recurring: 0, oneshot: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/crons", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { crons: CronJob[]; totals: Totals };
      setCrons(data.crons);
      setTotals(data.totals);
      setErr(null);
      setFlashKey((k) => k + 1);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 5000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const i = TABS.findIndex((t) => t.k === tab);
      const next = e.key === "ArrowLeft" ? (i - 1 + TABS.length) % TABS.length : (i + 1) % TABS.length;
      setTab(TABS[next]!.k);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab]);

  const scoped = useMemo(() => {
    if (tab === "enabled") return crons.filter((c) => c.enabled);
    if (tab === "recurring") return crons.filter((c) => c.schedule.kind === "recurring");
    if (tab === "oneshot") return crons.filter((c) => c.schedule.kind === "oneshot");
    return crons;
  }, [crons, tab]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return scoped;
    return scoped.filter((c) =>
      c.name.toLowerCase().includes(qq)
      || (c.description ?? "").toLowerCase().includes(qq)
      || c.spawn.prompt.toLowerCase().includes(qq)
      || (c.schedule.kind === "recurring" ? c.schedule.expression : c.schedule.at).toLowerCase().includes(qq),
    );
  }, [scoped, q]);

  const active = crons.find((c) => c.id === activeId) ?? filtered[0] ?? null;
  const nextFire = useMemo(() => nextFiringCron(crons), [crons]);

  const searchStyle: CSSProperties = { width: 280, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11.5, color: "var(--fg)", transition: "border-color .2s, box-shadow .2s" };

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>Cron jobs</h1>
          <p className="sub">Fire Claude sessions on a schedule. Recurring (cron expression) or one-shot (datetime). Fully autonomous — no approval prompts.</p>
        </div>
        <div className="right">
          <button
            className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`}
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh crons"
          >
            <RefreshIcon /><span>Refresh</span>
          </button>
          <button className="btn primary" onClick={() => setCreateOpen(true)}>Create cron</button>
        </div>
      </div>

      {err && <div style={{ padding: 12, background: "rgba(239,68,68,0.08)", color: "var(--state-error)", borderRadius: 4, marginBottom: 12, fontSize: 12 }}>Error: {err}</div>}

      <div className="agents-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.k}
            role="tab"
            aria-selected={tab === t.k}
            className={`agents-tab${tab === t.k ? " is-active" : ""}`}
            onClick={() => setTab(t.k)}
            title={t.hint}
          >
            <span className="lbl">{t.label}</span>
            <span className="cnt">
              {t.k === "all" ? totals.total
                : t.k === "enabled" ? totals.enabled
                : t.k === "recurring" ? totals.recurring
                : totals.oneshot}
            </span>
          </button>
        ))}
      </div>

      {loading && crons.length === 0 && (
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="metric-skel" />)}
        </div>
      )}

      {(crons.length > 0 || !loading) && (
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <StatCard flashKey={flashKey} label="Crons (total)" value={totals.total} foot={`${totals.enabled} enabled · ${totals.total - totals.enabled} paused`} />
          <StatCard flashKey={flashKey} label="Recurring" value={totals.recurring} foot="periodic" accent />
          <StatCard flashKey={flashKey} label="One-shot" value={totals.oneshot} foot="fire once" />
          <StatCard flashKey={flashKey} label="Next fire" value={0} foot={nextFire ? `${nextFire.name} · ${relativeFromNow(new Date(nextFire.at).getTime(), now)}` : "no upcoming fires"} customValue={nextFire ? shortClock(new Date(nextFire.at)) : "—"} />
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0 12px" }}>
        <h3 className="metric-h" style={{ margin: 0, flex: "none" }}>Scheduled · {filtered.length}</h3>
        <input
          style={searchStyle}
          placeholder="Filter crons…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand) 45%, var(--border))"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--brand) 14%, transparent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
        />
      </div>

      <div className="mcp-grid">
        <div className="mcp-list agents-list" style={{ gap: 0 }}>
          {filtered.length === 0 && !loading && (
            <div className="mcp-empty" style={{ textAlign: "center", padding: "28px 12px" }}>
              {crons.length === 0 ? "No crons yet. Create one to schedule a Claude session." : "No matches."}
            </div>
          )}
          {filtered.map((c) => <CronRowBtn key={c.id} cron={c} isActive={c.id === active?.id} now={now} onSelect={() => setActiveId(c.id)} />)}
        </div>

        {active
          ? <CronDetail cron={active} now={now} onChange={refresh} onDeleted={() => { setActiveId(null); void refresh(); }} />
          : <div className="mcp-empty">Select a cron to view details.</div>}
      </div>

      {createOpen && (
        <CronCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => { setCreateOpen(false); setActiveId(id); void refresh(); }}
        />
      )}
    </div>
  );
}

function CronRowBtn({ cron, isActive, now, onSelect }: { cron: CronJob; isActive: boolean; now: number; onSelect: () => void }) {
  const scheduleLabel = cron.schedule.kind === "recurring" ? cron.schedule.expression : shortClock(new Date(cron.schedule.at));
  const nextLabel = cron.enabled && cron.nextFireAt ? relativeFromNow(new Date(cron.nextFireAt).getTime(), now) : cron.enabled ? "—" : "paused";
  return (
    <button onClick={onSelect} className={`agent-row${isActive ? " is-active" : ""}`} aria-pressed={isActive}>
      <span className="agent-row-name" title={cron.name}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: cron.enabled ? "var(--state-ok, #10b981)" : "var(--fg-muted)", marginRight: 8, verticalAlign: "middle" }} />
        {cron.name}
        <span className="scope-dim" style={{ marginLeft: 8, fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{scheduleLabel}</span>
      </span>
      <span className="agent-row-meta">
        <span className={`model-badge tone-${cron.spawn.model.startsWith("opus") ? "opus" : cron.spawn.model.startsWith("sonnet") ? "sonnet" : "haiku"}`}>{cron.spawn.model.replace("-4.7", "").replace("-4.6", "").replace("-4.5", "")}</span>
        <span style={{ fontSize: 10.5, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", marginLeft: 8 }}>{nextLabel}</span>
      </span>
    </button>
  );
}

function StatCard({ label, value, customValue, foot, accent = false, flashKey }: { label: string; value: number; customValue?: string; foot: string; accent?: boolean; flashKey: number }) {
  return (
    <div className={`metric-card${accent ? " is-accent" : ""}`}>
      <div className="mc-glow" />
      <div className="mc-sheen" key={flashKey} />
      <div className="mc-label">{label}</div>
      <div className="mc-value">{customValue ?? value.toLocaleString()}</div>
      <div className="mc-foot">{foot}</div>
    </div>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3h-3" />
    </svg>
  );
}

function nextFiringCron(crons: CronJob[]): { name: string; at: string } | null {
  let best: { name: string; at: string } | null = null;
  for (const c of crons) {
    if (!c.enabled || !c.nextFireAt) continue;
    if (!best || new Date(c.nextFireAt).getTime() < new Date(best.at).getTime()) {
      best = { name: c.name, at: c.nextFireAt };
    }
  }
  return best;
}

export function shortClock(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeFromNow(target: number, now: number): string {
  const delta = target - now;
  const abs = Math.abs(delta);
  const sign = delta < 0 ? "-" : "in ";
  const s = Math.floor(abs / 1000);
  if (s < 60) return delta < 0 ? `${s}s ago` : `in ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${sign}${m}m${s % 60 ? ` ${s % 60}s` : ""}`.replace("in  ", "in ");
  const h = Math.floor(m / 60);
  if (h < 24) return `${sign}${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${sign}${d}d ${h % 24}h`;
}
