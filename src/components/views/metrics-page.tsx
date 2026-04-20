"use client";

import { useEffect, useState } from "react";

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

const PROJ_COLS = "minmax(260px, 1fr) 80px 90px 90px 80px 100px 90px";
const MODEL_COLS = "minmax(220px, 1fr) 80px 110px 110px 110px 100px";

export function MetricsPage() {
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/metrics", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { metrics: Metrics };
      setM(j.metrics);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); const id = setInterval(() => void refresh(), 15_000); return () => clearInterval(id); }, []);

  const peakDay = m ? Math.max(1, ...m.lastSevenDays.map((d) => d.sessions)) : 1;

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>Metrics</h1>
          <p className="sub">Aggregated from <code>~/.claude/projects/</code>. Refreshes every 15s. Usage is covered by your plan Max — no per-token billing shown.</p>
        </div>
        <div className="right">
          <button className="btn" onClick={() => void refresh()} disabled={loading}>Refresh</button>
        </div>
      </div>

      {err && <div style={{ color: "var(--state-error)", fontSize: 12, marginBottom: 14 }}>{err}</div>}
      {!m && loading && <div style={{ color: "var(--fg-muted)" }}>Loading…</div>}

      {m && (
        <>
          <div className="stat-grid">
            <StatCard label="Sessions (total)" value={String(m.totalSessions)}           foot={`${m.liveSessions} live · ${m.doneSessions} done · ${m.errorSessions} error`} />
            <StatCard label="Estimated cost"   value={fmtCost(m.totalCostUsd)}           foot="public Anthropic prices · covered by plan Max" accent />
            <StatCard label="Input tokens"     value={fmtTokens(m.totalInputTokens)}     foot={`${fmtTokens(m.totalOutputTokens)} output`} />
            <StatCard label="Cache read"       value={fmtTokens(m.totalCacheReadTokens)} foot={`${fmtTokens(m.totalCacheCreateTokens)} cache create`} />
            <StatCard label="Tool calls"       value={String(m.totalToolCalls)}          foot="sum over all sessions" />
          </div>

          <h3 style={metricH3}>Last 7 days · sessions ended</h3>
          <div className="days-grid">
            {m.lastSevenDays.map((d) => (
              <div key={d.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ height: 80, width: "100%", display: "flex", alignItems: "flex-end" }}>
                  <div style={{
                    width: "100%",
                    height: `${(d.sessions / peakDay) * 100}%`,
                    minHeight: d.sessions > 0 ? 2 : 0,
                    background: d.sessions > 0 ? "var(--brand)" : "transparent",
                    borderRadius: 2,
                  }} />
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg)" }}>{d.sessions}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-muted)" }}>{d.day.slice(5)}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, color: "var(--fg-faint)" }}>{fmtCost(d.costUsd)}</span>
              </div>
            ))}
          </div>

          <h3 style={metricH3}>Per project · top {Math.min(20, m.perProject.length)} by cost</h3>
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
                <div key={p.cwd} className="trow" style={{ gridTemplateColumns: PROJ_COLS }} title={p.cwd}>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, maxWidth: 320 }}>
                    <span className="tname cell-ellipsis" title={p.project}>{p.project}</span>
                    <span className="tdesc cell-ellipsis" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }} title={p.cwd}>{p.cwd}</span>
                  </span>
                  <span className="ncalls">{p.sessions}</span>
                  <span className="ncalls">{fmtTokens(p.inputTokens)}</span>
                  <span className="ncalls">{fmtTokens(p.outputTokens)}</span>
                  <span className="ncalls" data-col="tools">{p.toolUses}</span>
                  <span className="ncalls" style={{ color: "var(--brand)", fontWeight: 500 }}>{fmtCost(p.costUsd)}</span>
                  <span className="ncalls">{fmtRel(p.lastRunAt)}</span>
                </div>
              ))}
            </div>
          </div>

          <h3 style={metricH3}>Per model</h3>
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
                <div key={`${p.model}-${index}`} className="trow" style={{ gridTemplateColumns: MODEL_COLS }}>
                  <span className="tname cell-ellipsis" style={{ fontFamily: "var(--font-mono)" }} title={p.model}>{p.model}</span>
                  <span className="ncalls">{p.sessions}</span>
                  <span className="ncalls">{fmtTokens(p.inputTokens)}</span>
                  <span className="ncalls">{fmtTokens(p.outputTokens)}</span>
                  <span className="ncalls">{fmtTokens(p.cacheReadTokens)}</span>
                  <span className="ncalls" style={{ color: "var(--brand)", fontWeight: 500 }}>{fmtCost(p.costUsd)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, foot, accent = false }: { label: string; value: string; foot: string; accent?: boolean }) {
  return (
    <div style={{
      border: `1px solid ${accent ? "var(--brand)" : "var(--border)"}`,
      background: accent ? "rgba(255, 193, 79, 0.05)" : "var(--bg-tile)",
      borderRadius: 8,
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: accent ? "var(--brand)" : "var(--fg-faint)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", color: accent ? "var(--brand)" : "var(--fg)" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-muted)", marginTop: 4 }}>{foot}</div>
    </div>
  );
}

const metricH3: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 9.5,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--fg-faint)",
  fontFamily: "var(--font-mono)",
  fontWeight: 500,
};

function fmtTokens(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function fmtCost(n: number): string {
  if (!n) return "$0";
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
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
