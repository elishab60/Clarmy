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

      <div className="tools-table">
        <div className="trow head" style={{ gridTemplateColumns: "1fr 90px 100px 100px 110px 110px" }}>
          <span>project · cwd</span>
          <span style={{ textAlign: "right" }}>sessions</span>
          <span style={{ textAlign: "right" }}>msgs</span>
          <span style={{ textAlign: "right" }}>tools</span>
          <span style={{ textAlign: "right" }}>tokens</span>
          <span style={{ textAlign: "right" }}>last run</span>
        </div>
        {loading && (
          <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
            <span style={{ textAlign: "center" }}>Scanning ~/.claude/projects…</span>
          </div>
        )}
        {!loading && filtered.map((p) => (
          <button
            key={p.cwd}
            className="trow"
            style={{ gridTemplateColumns: "1fr 90px 100px 100px 110px 110px", textAlign: "left", cursor: "pointer" }}
            onClick={() => router.push(`/new?cwd=${encodeURIComponent(p.cwd)}`)}
          >
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span className="tname" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {p.name}
                {p.liveSessions > 0 && <span className="status-pill" style={{ fontSize: 9 }}>live · {p.liveSessions}</span>}
                {p.branches.slice(0, 2).map((b) => (
                  <span key={b} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--fg-muted)" }}>⎇ {b}</span>
                ))}
              </span>
              <span className="tdesc" style={{ fontFamily: "var(--font-mono)", fontSize: 10.5 }}>{p.cwd}</span>
            </span>
            <span className="ncalls">{p.sessions}</span>
            <span className="ncalls">{p.messages}</span>
            <span className="ncalls">{p.toolUses}</span>
            <span className="ncalls">{fmtTokens(p.inputTokens + p.outputTokens)}</span>
            <span className="ncalls">{fmtRel(p.lastRunAt)}</span>
          </button>
        ))}
        {!loading && filtered.length === 0 && (
          <div className="trow" style={{ gridTemplateColumns: "1fr", color: "var(--fg-muted)", justifyContent: "center" }}>
            <span style={{ textAlign: "center" }}>
              {rows.length === 0 ? "No Claude Code projects found — run a session with the CLI first." : `No projects match “${q}”.`}
            </span>
          </div>
        )}
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
