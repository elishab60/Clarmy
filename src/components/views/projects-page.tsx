"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const sessions = useCockpit((s) => s.sessions);

  const refresh = async () => {
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { projects: ProjectRow[] };
      setRows(j.projects);
      setErr(null);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
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

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>Projects</h1>
          <p className="sub">
            {rows.length} projects · {totalSessions} sessions · {fmtTokens(totalTokens)} tokens — discovered from <code>~/.claude/projects/</code>. Click a row to launch a new session in that cwd.
          </p>
        </div>
        <div className="right">
          <button className="btn" onClick={() => void refresh()} disabled={loading}>Refresh</button>
        </div>
      </div>

      <div style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center" }}>
        <input
          style={{ width: 320, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11.5, color: "var(--fg)" }}
          placeholder="Filter projects by name or cwd…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {err && <span style={{ fontSize: 11, color: "var(--state-error)" }}>{err}</span>}
      </div>

      <div className="table-scroll">
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
          {loading && (
            <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
              <span style={{ textAlign: "center" }}>Scanning ~/.claude/projects…</span>
            </div>
          )}
          {!loading && filtered.map((p) => {
            const branch = p.branches[0];
            const live = p.liveSessions > 0;
            return (
              <div key={p.cwd} className="trow" style={{ gridTemplateColumns: COLS }}>
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
                <span className="ncalls">{fmtTokens(p.inputTokens + p.outputTokens)}</span>
                <span className="ncalls">{fmtRel(p.lastRunAt)}</span>
                <span className={`tperm ${live ? "" : "ask"}`}
                      style={!live ? { color: "var(--fg-muted)", background: "transparent", boxShadow: "inset 0 0 0 1px var(--border)" } : undefined}>
                  {live ? `live · ${p.liveSessions}` : "idle"}
                </span>
                <button
                  className="btn"
                  style={{ justifySelf: "end", padding: "3px 10px", fontSize: 10.5 }}
                  onClick={(e) => { e.stopPropagation(); router.push(`/new?cwd=${encodeURIComponent(p.cwd)}`); }}
                  title={`new session in ${p.cwd}`}
                >
                  ↗ new
                </button>
              </div>
            );
          })}
          {!loading && filtered.length === 0 && (
            <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
              <span style={{ textAlign: "center" }}>
                {rows.length === 0 ? "No Claude Code projects found — run a session with the CLI first." : `No projects match “${q}”.`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
