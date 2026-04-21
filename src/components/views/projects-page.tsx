"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCockpit } from "@/lib/client/store";

interface ProjectRow {
  id: string;
  cwd: string;
  name: string;
  projectDir: string;
  sessions: number;
  messages: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreateTokens: number;
  lastRunAt: number;
  firstRunAt: number;
  branches: string[];
  liveSessions: number;
}

const COLS = "minmax(280px, 2fr) 120px 110px 60px 80px 80px 70px 90px";

export function ProjectsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qFocus, setQFocus] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const sessions = useCockpit((s) => s.sessions);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { projects: ProjectRow[] };
      setRows(j.projects);
      setErr(null);
      setFlashKey((k) => k + 1);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { void refresh(); const id = setInterval(() => void refresh(), 20_000); return () => clearInterval(id); }, []);

  const liveByCwd = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of Object.values(sessions)) {
      if (s.cwd) m[s.cwd] = (m[s.cwd] ?? 0) + 1;
    }
    return m;
  }, [sessions]);

  const merged = rows.map((p) => ({ ...p, liveSessions: Math.max(p.liveSessions, liveByCwd[p.cwd] ?? 0) }));
  const filtered = merged.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()) || p.cwd.toLowerCase().includes(q.toLowerCase()),
  );

  const totalSessions = merged.reduce((n, p) => n + p.sessions, 0);
  const totalTokens = merged.reduce((n, p) => n + p.inputTokens + p.outputTokens, 0);
  const totalTools = merged.reduce((n, p) => n + p.toolUses, 0);
  const liveCount = merged.reduce((n, p) => n + (p.liveSessions > 0 ? 1 : 0), 0);
  const maxActivity = Math.max(1, ...merged.map((p) => p.inputTokens + p.outputTokens));

  return (
    <div className="cfg-shell metrics-shell">
      <div className="cfg-header">
        <div>
          <h1>Projects</h1>
          <p className="sub">
            Discovered from <code>~/.claude/projects/</code>. Click <em>new</em> to launch a session in that cwd.
          </p>
        </div>
        <div className="right">
          <button
            className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`}
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh projects"
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {!rows.length && loading && (
        <div className="stat-grid">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="metric-skel" />)}
        </div>
      )}

      {(rows.length > 0 || !loading) && (
        <>
          <div className="stat-grid">
            <StatCard flashKey={flashKey} label="Projects" value={rows.length} format={fmtInt} foot={`${liveCount} live · ${rows.length - liveCount} idle`} delay={0} />
            <StatCard flashKey={flashKey} label="Sessions (total)" value={totalSessions} format={fmtInt} foot="across all projects" delay={60} accent />
            <StatCard flashKey={flashKey} label="Tokens" value={totalTokens} format={fmtTokens} foot={`${fmtInt(totalTools)} tool calls`} delay={120} />
            <StatCard flashKey={flashKey} label="Matching" value={filtered.length} format={fmtInt} foot={q ? `filter: "${q}"` : "all projects"} delay={180} />
          </div>

          <h3 className="metric-h" style={{ animation: "metric-rise .5s cubic-bezier(.2,.7,.2,1) both" }}>Filter</h3>
          <div style={{ marginBottom: 18, display: "flex", gap: 10, alignItems: "center", animation: "metric-rise .5s cubic-bezier(.2,.7,.2,1) both", animationDelay: "60ms" }}>
            <input
              style={{
                width: 340,
                padding: "7px 11px",
                background: "var(--bg)",
                border: `1px solid ${qFocus ? "var(--brand)" : "var(--border)"}`,
                borderRadius: 4,
                fontSize: 11.5,
                color: "var(--fg)",
                outline: "none",
                boxShadow: qFocus ? "0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent), 0 0 18px -4px var(--brand)" : "none",
                transition: "border-color .18s, box-shadow .18s",
              }}
              placeholder="Filter projects by name or cwd…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setQFocus(true)}
              onBlur={() => setQFocus(false)}
            />
            {err && <span style={{ fontSize: 11, color: "var(--state-error)" }}>{err}</span>}
          </div>

          <h3 className="metric-h" style={{ animation: "metric-rise .5s cubic-bezier(.2,.7,.2,1) both", animationDelay: "120ms" }}>
            Projects · {filtered.length} shown
          </h3>
          <div className="table-scroll" style={{ animation: "metric-rise .5s cubic-bezier(.2,.7,.2,1) both", animationDelay: "180ms" }}>
            <div className="tools-table" style={{ minWidth: 960 }}>
              <div className="trow head" style={{ gridTemplateColumns: COLS }}>
                <span>project · cwd</span>
                <span>sessions</span>
                <span data-col="branch">branch</span>
                <span style={{ textAlign: "right" }}>msgs</span>
                <span style={{ textAlign: "right" }}>tokens</span>
                <span style={{ textAlign: "right" }}>when</span>
                <span style={{ textAlign: "right" }}>state</span>
                <span style={{ textAlign: "right" }}>action</span>
              </div>
              {loading && rows.length === 0 && (
                <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
                  <span style={{ textAlign: "center" }}>Scanning ~/.claude/projects…</span>
                </div>
              )}
              {filtered.map((p, i) => (
                <ProjectRowView
                  key={p.cwd}
                  p={p}
                  t={(p.inputTokens + p.outputTokens) / maxActivity}
                  delay={Math.min(i * 22, 500)}
                  onNew={() => router.push(`/new?cwd=${encodeURIComponent(p.cwd)}`)}
                />
              ))}
              {!loading && filtered.length === 0 && rows.length > 0 && (
                <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
                  <span style={{ textAlign: "center" }}>No projects match &ldquo;{q}&rdquo;.</span>
                </div>
              )}
              {!loading && rows.length === 0 && (
                <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
                  <span style={{ textAlign: "center" }}>No Claude Code projects found — run a session with the CLI first.</span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProjectRowView({ p, t, delay, onNew }: { p: ProjectRow; t: number; delay: number; onNew: () => void }) {
  const branch = p.branches[0];
  const live = p.liveSessions > 0;
  return (
    <div
      className="trow m-row"
      style={{
        gridTemplateColumns: COLS,
        animation: "metric-rise .5s cubic-bezier(.2,.7,.2,1) both",
        animationDelay: `${delay}ms`,
      }}
      title={p.cwd}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, maxWidth: 400 }}>
        <span className="tname cell-ellipsis" title={p.name}>{p.name}</span>
        <span className="tdesc cell-ellipsis" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }} title={p.cwd}>{p.cwd}</span>
      </span>
      <span className="tdesc cell-ellipsis" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }} title={`${p.sessions} sessions · ${p.toolUses} tools`}>
        {p.sessions} · {p.toolUses} tools
      </span>
      <span className="tdesc cell-ellipsis" data-col="branch" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }} title={branch ?? "—"}>
        {branch ? `⎇ ${branch}` : "—"}
      </span>
      <span className="ncalls">{p.messages}</span>
      <span className="ncalls" style={{ textAlign: "right" }}>
        <span className="m-cost" style={{ ["--t" as string]: `${t}` } as React.CSSProperties}>
          <span>{fmtTokens(p.inputTokens + p.outputTokens)}</span>
        </span>
      </span>
      <span className="ncalls">{fmtRel(p.lastRunAt)}</span>
      <span
        className={`tperm ${live ? "" : "ask"}`}
        style={!live ? { color: "var(--fg-muted)", background: "transparent", boxShadow: "inset 0 0 0 1px var(--border)" } : undefined}
      >
        {live ? `live · ${p.liveSessions}` : "idle"}
      </span>
      <button
        className="btn"
        style={{ justifySelf: "end", padding: "3px 10px", fontSize: 10.5 }}
        onClick={(e) => { e.stopPropagation(); onNew(); }}
        title={`new session in ${p.cwd}`}
      >
        ↗ new
      </button>
    </div>
  );
}

function StatCard({ label, value, format, foot, accent = false, flashKey, delay }: { label: string; value: number; format: (n: number) => string; foot: string; accent?: boolean; flashKey: number; delay: number }) {
  return (
    <div
      className={`metric-card${accent ? " is-accent" : ""}`}
      style={{ animation: "metric-rise .5s cubic-bezier(.2,.7,.2,1) both", animationDelay: `${delay}ms` }}
    >
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

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3h-3" />
    </svg>
  );
}

function fmtInt(n: number): string { return Math.round(n).toLocaleString(); }

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

function fmtTokens(n: number): string {
  const r = Math.round(n);
  if (r >= 1_000_000) return `${(r / 1_000_000).toFixed(2)}M`;
  if (r >= 1_000) return `${(r / 1_000).toFixed(0)}k`;
  return String(r);
}
