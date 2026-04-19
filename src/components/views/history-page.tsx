"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ModelId } from "@/lib/shared/types";

interface CCSessionRow {
  id: string;
  file: string;
  cwd: string;
  project: string;
  branch?: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  model?: string;
  firstPrompt: string;
  messageCount: number;
  toolUses: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  state: "done" | "error" | "ongoing";
  version?: string;
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

export function HistoryPage() {
  const router = useRouter();
  const [rows, setRows] = useState<CCSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [project, setProject] = useState<string | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumeErr, setResumeErr] = useState<string | null>(null);

  const resume = async (r: CCSessionRow) => {
    setResumingId(r.id); setResumeErr(null);
    try {
      const model: ModelId = (r.model ? MODEL_ALIAS[r.model] : undefined) ?? "opus-4.7";
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: r.project,
          cwd: r.cwd,
          name: `resume · ${r.firstPrompt.slice(0, 60) || r.id}`,
          model,
          prompt: "",
          allowedTools: [],
          approvalMode: "prompt",
          branch: r.branch,
          resumeSessionId: r.id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "unknown" }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.push("/");
    } catch (e) {
      setResumeErr((e as Error).message);
      setResumingId(null);
    }
  };

  const refresh = async () => {
    try {
      const res = await fetch(`/api/history?limit=1000`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { sessions: CCSessionRow[] };
      setRows(j.sessions);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
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
  };

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>History</h1>
          <p className="sub">
            {rows.length} sessions from your Claude Code plan (Max x20). Sourced from <code>~/.claude/projects/*/*.jsonl</code>.
          </p>
        </div>
        <div className="right">
          <button className="btn" onClick={() => void refresh()} disabled={loading}>Refresh</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
        <div className="model-picker">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>all · {counts.all}</button>
          <button className={filter === "done" ? "on" : ""} onClick={() => setFilter("done")}>done · {counts.done}</button>
          <button className={filter === "error" ? "on" : ""} onClick={() => setFilter("error")}>error · {counts.error}</button>
        </div>
        <select
          value={project ?? ""}
          onChange={(e) => setProject(e.target.value || null)}
          style={{ padding: "5px 8px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg)" }}
        >
          <option value="">all projects</option>
          {projects.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <input
          style={{ marginLeft: "auto", width: 280, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11.5, color: "var(--fg)" }}
          placeholder="Filter project · prompt · branch…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {err && <span style={{ fontSize: 11, color: "var(--state-error)" }}>{err}</span>}
      </div>

      {resumeErr && <div style={{ color: "var(--state-error)", fontSize: 11.5, marginBottom: 10 }}>Resume failed: {resumeErr}</div>}

      <div className="tools-table">
        <div className="trow head" style={{ gridTemplateColumns: "2fr 140px 110px 70px 80px 90px 70px 80px" }}>
          <span>prompt · project</span>
          <span>model</span>
          <span>branch</span>
          <span style={{ textAlign: "right" }}>msgs</span>
          <span style={{ textAlign: "right" }}>tokens</span>
          <span style={{ textAlign: "right" }}>when</span>
          <span style={{ textAlign: "right" }}>state</span>
          <span style={{ textAlign: "right" }}>action</span>
        </div>
        {loading && (
          <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
            <span style={{ textAlign: "center" }}>Scanning your Claude Code sessions…</span>
          </div>
        )}
        {!loading && filtered.slice(0, 400).map((r) => {
          const busy = resumingId === r.id;
          return (
            <div key={r.file} className="trow" style={{ gridTemplateColumns: "2fr 140px 110px 70px 80px 90px 70px 80px" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span className="tname" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.firstPrompt}</span>
                <span className="tdesc" style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>{r.project} · {fmtDuration(r.durationMs)}</span>
              </span>
              <span className="tdesc" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{r.model ?? "—"}</span>
              <span className="tdesc" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{r.branch ?? "—"}</span>
              <span className="ncalls">{r.messageCount}</span>
              <span className="ncalls">{fmtTokens(r.inputTokens + r.outputTokens)}</span>
              <span className="ncalls">{fmtRel(r.endedAt)}</span>
              <span className={`tperm ${r.state === "done" ? "" : "ask"}`}
                    style={r.state === "error" ? { color: "var(--state-error)", background: "rgba(239,68,68,0.08)", boxShadow: "inset 0 0 0 1px rgba(239,68,68,0.2)" } : undefined}>
                {r.state}
              </span>
              <button
                className="btn"
                style={{ justifySelf: "end", padding: "3px 10px", fontSize: 10.5, opacity: busy ? 0.5 : 1 }}
                disabled={busy}
                onClick={(e) => { e.stopPropagation(); void resume(r); }}
                title={`claude --resume ${r.id}`}
              >
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
      {filtered.length > 400 && (
        <p style={{ textAlign: "center", color: "var(--fg-muted)", fontSize: 11, marginTop: 10 }}>Showing 400 of {filtered.length} — narrow filters to see more.</p>
      )}
    </div>
  );
}

function fmtDuration(ms: number): string {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
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
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}
