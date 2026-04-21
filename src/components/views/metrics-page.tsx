"use client";

import { useEffect, useRef, useState } from "react";

interface Metrics {
  totalSessions: number;
  liveSessions: number;
  doneSessions: number;
  errorSessions: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheReadTokens: number;
  totalCacheCreateTokens: number;
  totalToolCalls: number;
  totalCostUsd: number;
  perProject: Array<{ project: string; cwd: string; sessions: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; toolUses: number; lastRunAt: number; costUsd: number }>;
  perModel: Array<{ model: string; sessions: number; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheCreateTokens: number; costUsd: number }>;
  lastSevenDays: Array<{ day: string; sessions: number; messages: number; toolUses: number; costUsd: number }>;
}

const PROJ_COLS = "minmax(260px, 1fr) 80px 90px 90px 80px 110px 90px";
const MODEL_COLS = "minmax(220px, 1fr) 80px 110px 110px 110px 110px";

export function MetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { metrics: Metrics };
      setM(j.metrics);
      setErr(null);
      setFlashKey((k) => k + 1);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { void refresh(); const id = setInterval(() => void refresh(), 15_000); return () => clearInterval(id); }, []);

  const peakDay = m ? Math.max(1, ...m.lastSevenDays.map((d) => d.sessions)) : 1;
  const maxProjCost = m ? Math.max(1e-9, ...m.perProject.map((p) => p.costUsd)) : 1;
  const maxModelCost = m ? Math.max(1e-9, ...m.perModel.map((p) => p.costUsd)) : 1;

  return (
    <div className="cfg-shell metrics-shell">
      <div className="cfg-header">
        <div>
          <h1>Metrics</h1>
          <p className="sub">Aggregated from <code>~/.claude/projects/</code>. Refreshes every 15s. Usage is covered by your plan Max — no per-token billing shown.</p>
        </div>
        <div className="right">
          <button
            className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`}
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh metrics"
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {err && <div style={{ color: "var(--state-error)", fontSize: 12, marginBottom: 14 }}>{err}</div>}
      {!m && loading && (
        <div className="stat-grid">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="metric-skel" />)}
        </div>
      )}

      {m && (
        <>
          <div className="stat-grid">
            <StatCard flashKey={flashKey} label="Sessions (total)" value={m.totalSessions} format={fmtInt} foot={`${m.liveSessions} live · ${m.doneSessions} done · ${m.errorSessions} error`} />
            <StatCard flashKey={flashKey} label="Estimated cost"   value={m.totalCostUsd}   format={fmtCost} foot="public Anthropic prices · covered by plan Max" accent />
            <StatCard flashKey={flashKey} label="Input tokens"     value={m.totalInputTokens} format={fmtTokens} foot={`${fmtTokens(m.totalOutputTokens)} output`} />
            <StatCard flashKey={flashKey} label="Cache read"       value={m.totalCacheReadTokens} format={fmtTokens} foot={`${fmtTokens(m.totalCacheCreateTokens)} cache create`} />
            <StatCard flashKey={flashKey} label="Tool calls"       value={m.totalToolCalls} format={fmtInt} foot="sum over all sessions" />
          </div>

          <h3 className="metric-h">Last 7 days · sessions ended</h3>
          <DaysChart days={m.lastSevenDays} peak={peakDay} />

          <h3 className="metric-h">Per project · top {Math.min(20, m.perProject.length)} by cost</h3>
          <div className="table-scroll" style={{ marginBottom: 24 }}>
            <div className="tools-table" style={{ minWidth: 860 }}>
              <div className="trow head" style={{ gridTemplateColumns: PROJ_COLS }}>
                <span>project</span>
                <span style={{ textAlign: "right" }}>sessions</span>
                <span style={{ textAlign: "right" }}>input</span>
                <span style={{ textAlign: "right" }}>output</span>
                <span data-col="tools" style={{ textAlign: "right" }}>tools</span>
                <span style={{ textAlign: "right" }}>cost</span>
                <span style={{ textAlign: "right" }}>last run</span>
              </div>
              {m.perProject.length === 0 && (
                <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
                  <span style={{ textAlign: "center" }}>No data yet.</span>
                </div>
              )}
              {m.perProject.slice(0, 20).map((p) => (
                <div key={p.cwd} className="trow m-row" style={{ gridTemplateColumns: PROJ_COLS }} title={p.cwd}>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, maxWidth: 320 }}>
                    <span className="tname cell-ellipsis" title={p.project}>{p.project}</span>
                    <span className="tdesc cell-ellipsis" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }} title={p.cwd}>{p.cwd}</span>
                  </span>
                  <span className="ncalls">{p.sessions}</span>
                  <span className="ncalls">{fmtTokens(p.inputTokens)}</span>
                  <span className="ncalls">{fmtTokens(p.outputTokens)}</span>
                  <span className="ncalls" data-col="tools">{p.toolUses}</span>
                  <span className="ncalls" style={{ textAlign: "right" }}>
                    <span className="m-cost" style={{ ["--t" as string]: `${p.costUsd / maxProjCost}` } as React.CSSProperties}>
                      <span>{fmtCost(p.costUsd)}</span>
                    </span>
                  </span>
                  <span className="ncalls">{fmtRel(p.lastRunAt)}</span>
                </div>
              ))}
            </div>
          </div>

          <h3 className="metric-h">Per model</h3>
          <div className="table-scroll">
            <div className="tools-table" style={{ minWidth: 720 }}>
              <div className="trow head" style={{ gridTemplateColumns: MODEL_COLS }}>
                <span>model</span>
                <span style={{ textAlign: "right" }}>sessions</span>
                <span style={{ textAlign: "right" }}>input</span>
                <span style={{ textAlign: "right" }}>output</span>
                <span style={{ textAlign: "right" }}>cache read</span>
                <span style={{ textAlign: "right" }}>cost</span>
              </div>
              {m.perModel.map((p, index) => (
                <div key={`${p.model}-${index}`} className="trow m-row" style={{ gridTemplateColumns: MODEL_COLS }}>
                  <span className="tname cell-ellipsis" style={{ fontFamily: "var(--font-mono)" }} title={p.model}>{p.model}</span>
                  <span className="ncalls">{p.sessions}</span>
                  <span className="ncalls">{fmtTokens(p.inputTokens)}</span>
                  <span className="ncalls">{fmtTokens(p.outputTokens)}</span>
                  <span className="ncalls">{fmtTokens(p.cacheReadTokens)}</span>
                  <span className="ncalls" style={{ textAlign: "right" }}>
                    <span className="m-cost" style={{ ["--t" as string]: `${p.costUsd / maxModelCost}` } as React.CSSProperties}>
                      <span>{fmtCost(p.costUsd)}</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, format, foot, accent = false, flashKey }: { label: string; value: number; format: (n: number) => string; foot: string; accent?: boolean; flashKey: number }) {
  return (
    <div className={`metric-card${accent ? " is-accent" : ""}`}>
      <div className="mc-glow" />
      <div className="mc-sheen" key={flashKey} />
      <div className="mc-label">{label}</div>
      <div className="mc-value"><AnimatedNumber value={value} format={format} /></div>
      <div className="mc-foot">{foot}</div>
    </div>
  );
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const delta = value - start;
    if (Math.abs(delta) < 1e-9) { setDisplay(value); return; }
    const t0 = performance.now();
    const dur = 850;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = start + delta * eased;
      setDisplay(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(display)}</>;
}

function DaysChart({ days, peak }: { days: Metrics["lastSevenDays"]; peak: number }) {
  return (
    <div className="days-chart">
      <div className="dc-grid"><span /><span /><span /><span /><span /></div>
      {days.map((d, i) => {
        const pct = (d.sessions / peak) * 100;
        const empty = d.sessions === 0;
        const isPeak = d.sessions === peak && !empty;
        return (
          <div key={d.day} className={`day-col${empty ? " is-empty" : ""}${isPeak ? " is-peak" : ""}`}>
            <div className="day-tip">
              <div className="row"><span className="k">date</span><span className="v">{d.day}</span></div>
              <div className="row"><span className="k">sessions</span><span className="v">{d.sessions}</span></div>
              <div className="row"><span className="k">messages</span><span className="v">{d.messages}</span></div>
              <div className="row"><span className="k">tools</span><span className="v">{d.toolUses}</span></div>
              <div className="row"><span className="k">cost</span><span className="v brand">{fmtCost(d.costUsd)}</span></div>
            </div>
            <div className="day-bar-wrap">
              <div
                className="day-bar"
                style={{
                  height: `${empty ? 2 : pct}%`,
                  minHeight: empty ? 2 : 2,
                  animationDelay: `${i * 55}ms`,
                }}
              />
            </div>
            <span className="dn">{d.sessions}</span>
            <span className="dd">{d.day.slice(5)}</span>
            <span className="dc">{fmtCost(d.costUsd)}</span>
          </div>
        );
      })}
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

function fmtInt(n: number): string { return Math.round(n).toLocaleString(); }

function fmtTokens(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

function fmtCost(n: number): string {
  if (!n) return "$0";
  const abs = Math.abs(n);
  if (abs >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (abs >= 100) return `$${n.toFixed(0)}`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function fmtRel(t: number): string {
  if (!t) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
