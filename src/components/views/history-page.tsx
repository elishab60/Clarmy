"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModelId } from "@/lib/shared/types";

interface CCSessionRow {
  id: string; file: string; cwd: string; project: string; branch?: string;
  startedAt: number; endedAt: number; durationMs: number;
  model?: string; firstPrompt: string; messageCount: number; toolUses: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number;
  state: "done" | "error" | "ongoing"; version?: string;
}

type Filter = "all" | "done" | "error";

const MODEL_ALIAS: Record<string, ModelId> = {
  "claude-opus-4-7": "opus-4.7",
  "claude-opus-4-6": "opus-4.7",
  "claude-opus-4-5": "opus-4.7",
  "claude-opus-4-5-20251101": "opus-4.7",
  "claude-sonnet-4-6": "sonnet-4.6",
  "claude-sonnet-4-5": "sonnet-4.6",
  "claude-haiku-4-5": "haiku-4.5",
  "claude-haiku-4-5-20251001": "haiku-4.5",
};

const COLS = "minmax(280px, 2fr) 120px 110px 60px 80px 80px 70px 90px";
const CHIP: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 10.5, transition: "color .25s, text-shadow .25s" };
const ERR_CHIP: React.CSSProperties = { color: "var(--state-error)", background: "rgba(239,68,68,0.08)", boxShadow: "inset 0 0 0 1px rgba(239,68,68,0.2)", transition: "filter .2s" };

export function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CCSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [project, setProject] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeErr, setResumeErr] = useState<string | null>(null);
  const [hoverRow, setHoverRow] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  const resume = async (r: CCSessionRow) => {
    setResumingId(r.id); setResumeErr(null);
    try {
      const model: ModelId = (r.model ? MODEL_ALIAS[r.model] : undefined) ?? "opus-4.7";
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: r.project, cwd: r.cwd,
          name: `resume · ${r.firstPrompt.slice(0, 60) || r.id}`,
          model, prompt: "", allowedTools: [], approvalMode: "prompt",
          branch: r.branch, resumeSessionId: r.id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "unknown" }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.push("/");
    } catch (e) { setResumeErr((e as Error).message); setResumingId(null); }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/history?limit=1000`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { sessions: CCSessionRow[] };
      setRows(j.sessions); setErr(null); setFlashKey((k) => k + 1);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { void refresh(); const id = setInterval(() => void refresh(), 30_000); return () => clearInterval(id); }, []);

  const projects = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(r.project);
    return Array.from(s).sort();
  }, [rows]);

  const filtered = rows.filter((r) => {
    if (filter !== "all" && r.state !== filter) return false;
    if (project && r.project !== project) return false;
    if (!q) return true;
    const qq = q.toLowerCase();
    return r.project.toLowerCase().includes(qq)
      || r.cwd.toLowerCase().includes(qq)
      || r.firstPrompt.toLowerCase().includes(qq)
      || (r.branch?.toLowerCase().includes(qq) ?? false);
  });

  const counts = {
    all: rows.length,
    done: rows.filter((r) => r.state === "done").length,
    error: rows.filter((r) => r.state === "error").length,
    ongoing: rows.filter((r) => r.state === "ongoing").length,
  };
  const totalTokens = rows.reduce((a, r) => a + r.inputTokens + r.outputTokens, 0);
  const maxTokens = Math.max(1, ...rows.map((r) => r.inputTokens + r.outputTokens));
  const chipStyle = (active: boolean): React.CSSProperties => active
    ? { ...CHIP, color: "color-mix(in srgb, var(--brand) 70%, var(--fg))", textShadow: "0 0 8px color-mix(in srgb, var(--brand) 30%, transparent)" }
    : { ...CHIP, color: "var(--fg-muted)" };

  return (
    <div className="cfg-shell metrics-shell">
      <div className="cfg-header">
        <div>
          <h1>History</h1>
          <p className="sub">
            {rows.length} sessions from your Claude Code plan (Max x20). Sourced from <code>~/.claude/projects/*/*.jsonl</code>.
          </p>
        </div>
        <div className="right">
          <button className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`} onClick={() => void refresh()} disabled={loading} aria-label="Refresh history">
            <RefreshIcon /><span>Refresh</span>
          </button>
        </div>
      </div>

      {!rows.length && loading && (
        <div className="stat-grid">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="metric-skel" />)}
        </div>
      )}

      {rows.length > 0 && (
        <div className="stat-grid">
          <StatCard flashKey={flashKey} label="Sessions" value={counts.all} format={fmtInt} foot={`${counts.ongoing} ongoing · ${counts.done} done · ${counts.error} error`} accent />
          <StatCard flashKey={flashKey} label="Completed" value={counts.done} format={fmtInt} foot="state = done" />
          <StatCard flashKey={flashKey} label="Errors" value={counts.error} format={fmtInt} foot="state = error" />
          <StatCard flashKey={flashKey} label="Total tokens" value={totalTokens} format={fmtTokens} foot="input + output across all runs" />
        </div>
      )}

      <h3 className="metric-h">Filter · search</h3>

      <div className="history-filter-bar">
        <div className="filter-tokens">
          <FilterToken label="all" count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
          <span className="filter-sep" aria-hidden>·</span>
          <FilterToken label="done" count={counts.done} active={filter === "done"} onClick={() => setFilter("done")} />
          <span className="filter-sep" aria-hidden>·</span>
          <FilterToken label="error" count={counts.error} active={filter === "error"} onClick={() => setFilter("error")} />
        </div>
        <select className="filter-project-dd" value={project ?? ""} onChange={(e) => setProject(e.target.value || null)} aria-label="Filter by project">
          <option value="">all projects</option>
          {projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input placeholder="Filter project · prompt · branch…" value={q} onChange={(e) => setQ(e.target.value)}
          style={{ marginLeft: "auto", width: 280, height: 32, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11.5, color: "var(--fg)", transition: "border-color .2s, box-shadow .2s" }} />
        {err && <span style={{ fontSize: 11, color: "var(--state-error)" }}>{err}</span>}
      </div>

      {resumeErr && <div style={{ color: "var(--state-error)", fontSize: 11.5, marginBottom: 10 }}>Resume failed: {resumeErr}</div>}

      <h3 className="metric-h">Sessions · most recent first</h3>

      <div className="table-scroll">
        <div className="tools-table" style={{ minWidth: 960 }}>
          <div className="trow head" style={{ gridTemplateColumns: COLS }}>
            <span>prompt · project</span>
            <span>model</span>
            <span data-col="branch">branch</span>
            <span style={{ textAlign: "right" }}>msgs</span>
            <span style={{ textAlign: "right" }}>tokens</span>
            <span style={{ textAlign: "right" }}>when</span>
            <span style={{ textAlign: "right" }}>state</span>
            <span style={{ textAlign: "right" }}>action</span>
          </div>
          {loading && rows.length === 0 && (
            <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
              <span style={{ textAlign: "center" }}>Scanning your Claude Code sessions…</span>
            </div>
          )}
          {!loading && filtered.slice(0, 400).map((r, i) => {
            const busy = resumingId === r.id;
            const tokens = r.inputTokens + r.outputTokens;
            const t = tokens / maxTokens;
            const isHov = hoverRow === r.file;
            return (
              <div key={r.file} className="trow m-row"
                onMouseEnter={() => setHoverRow(r.file)}
                onMouseLeave={() => setHoverRow((h) => (h === r.file ? null : h))}
                style={{ gridTemplateColumns: COLS, animation: "metric-rise .45s cubic-bezier(.2,.7,.2,1) both", animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, maxWidth: 400 }}>
                  <span className="tname cell-ellipsis" title={r.firstPrompt}>{r.firstPrompt}</span>
                  <span className="tdesc cell-ellipsis" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }} title={`${r.project} · ${r.cwd}`}>{r.project} · {fmtDuration(r.durationMs)}</span>
                </span>
                <span className="tdesc cell-ellipsis" title={r.model ?? "—"} style={chipStyle(isHov)}>{r.model ?? "—"}</span>
                <span className="tdesc cell-ellipsis" data-col="branch" title={r.branch ?? "—"} style={chipStyle(isHov)}>{r.branch ?? "—"}</span>
                <span className="ncalls">{r.messageCount}</span>
                <span className="ncalls" style={{ textAlign: "right" }}>
                  <span className="m-cost" style={{ ["--t" as string]: `${t}` } as React.CSSProperties}>
                    <span>{fmtTokens(tokens)}</span>
                  </span>
                </span>
                <span className="ncalls">{fmtRel(r.endedAt)}</span>
                <span className={`tperm ${r.state === "done" ? "" : "ask"}`}
                  style={r.state === "error" ? { ...ERR_CHIP, filter: isHov ? "brightness(1.15)" : undefined } : { transition: "filter .2s", filter: isHov ? "brightness(1.15)" : undefined }}>
                  {r.state}
                </span>
                <button className="btn" disabled={busy} onClick={(e) => { e.stopPropagation(); void resume(r); }}
                  title={`claude --resume ${r.id}`}
                  style={{ justifySelf: "end", padding: "3px 10px", fontSize: 10.5, opacity: busy ? 0.5 : 1, transition: "border-color .2s, color .2s" }}>
                  {busy ? "…" : "↺ resume"}
                </button>
              </div>
            );
          })}
          {!loading && filtered.length === 0 && (
            <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
              <span style={{ textAlign: "center" }}>No sessions match these filters.</span>
            </div>
          )}
        </div>
      </div>
      {filtered.length > 400 && (
        <p style={{ textAlign: "center", color: "var(--fg-muted)", fontSize: 11, marginTop: 10 }}>Showing 400 of {filtered.length} — narrow filters to see more.</p>
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
      <div className="mc-foot" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{foot}</div>
    </div>
  );
}

function FilterToken({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button className={`filter-token${active ? " is-active" : ""}`} onClick={onClick} aria-pressed={active} title={`${label} · ${count}`}>
      <span className="filter-count">{count}</span>
      <span className="filter-label">{label}</span>
    </button>
  );
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const delta = value - start;
    if (Math.abs(delta) < 1e-9) { setDisplay(value); return; }
    const t0 = performance.now(); const dur = 850; let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setDisplay(start + delta * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick); else prevRef.current = value;
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

function fmtDuration(ms: number): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000); const m = Math.floor(s / 60); const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function fmtRel(t: number): string {
  if (!t) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}
