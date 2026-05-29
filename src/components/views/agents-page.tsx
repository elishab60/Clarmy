"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { AgentDetail } from "./agents/agent-detail";
import { AgentCreateModal } from "./agents/agent-create-modal";

export interface AgentRow {
  id: string;
  name: string;
  source: "user" | "project" | "plugin" | "builtin";
  plugin?: string;
  marketplace?: string;
  description: string;
  model: string;
  tools?: string;
  color?: string;
  path?: string;
  editable: boolean;
}

type Tab = "agents" | "running" | "library";

const TABS: { k: Tab; label: string; hint: string }[] = [
  { k: "agents", label: "Agents", hint: "All configured agents" },
  { k: "running", label: "Running", hint: "Currently active in sessions" },
  { k: "library", label: "Library", hint: "Built-in & plugin catalog" },
];

export function AgentsPage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("agents");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/agents", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { agents: AgentRow[] };
      setAgents(data.agents);
      setErr(null);
      setFlashKey((k) => k + 1);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 20000); return () => clearInterval(t); }, [refresh]);

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
    if (tab === "library") return agents.filter((a) => a.source === "plugin" || a.source === "builtin");
    if (tab === "running") return [] as AgentRow[];
    return agents;
  }, [agents, tab]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    if (!qq) return scoped;
    return scoped.filter((a) =>
      a.name.toLowerCase().includes(qq)
      || a.description.toLowerCase().includes(qq)
      || (a.plugin ?? "").toLowerCase().includes(qq),
    );
  }, [scoped, q]);

  const active = agents.find((a) => a.id === activeId) ?? filtered[0] ?? null;

  const groups = useMemo(() => {
    const g = { user: [] as AgentRow[], project: [] as AgentRow[], plugin: [] as AgentRow[], builtin: [] as AgentRow[] };
    for (const a of filtered) g[a.source].push(a);
    return g;
  }, [filtered]);

  const totals = useMemo(() => ({
    total: agents.length,
    user: agents.filter((a) => a.source === "user").length,
    project: agents.filter((a) => a.source === "project").length,
    plugin: agents.filter((a) => a.source === "plugin").length,
    builtin: agents.filter((a) => a.source === "builtin").length,
  }), [agents]);

  const searchStyle: CSSProperties = { width: 280, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11.5, color: "var(--fg)", transition: "border-color .2s, box-shadow .2s" };

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>Agents</h1>
          <p className="sub">Subagents Claude can dispatch for specialized work. Edit your own, inspect plugin &amp; built-in ones.</p>
        </div>
        <div className="right">
          <button
            className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`}
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh agents"
          >
            <RefreshIcon /><span>Refresh</span>
          </button>
          <button className="btn primary" onClick={() => setCreateOpen(true)}>Create new agent</button>
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
              {t.k === "agents" ? totals.total
                : t.k === "library" ? totals.plugin + totals.builtin
                : 0}
            </span>
          </button>
        ))}
      </div>

      {loading && agents.length === 0 && (
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="metric-skel" />)}
        </div>
      )}

      {agents.length > 0 && (
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <StatCard flashKey={flashKey} label="Agents (total)" value={totals.total} foot={`${totals.user} yours · ${totals.plugin + totals.builtin} provided`} />
          <StatCard flashKey={flashKey} label="Yours" value={totals.user + totals.project} foot={`${totals.user} user · ${totals.project} project`} accent />
          <StatCard flashKey={flashKey} label="Plugin" value={totals.plugin} foot="from installed plugins" />
          <StatCard flashKey={flashKey} label="Built-in" value={totals.builtin} foot="always available" />
        </div>
      )}

      {tab === "running" && (
        <div className="agents-placeholder">
          <div className="ph-icon">◐</div>
          <div className="ph-title">No agents running</div>
          <div className="ph-sub">Spawned subagents will show here while sessions invoke them.</div>
        </div>
      )}

      {tab !== "running" && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <h3 className="metric-h" style={{ margin: 0, flex: "none" }}>{tab === "library" ? "Catalog" : "Installed"} · {filtered.length}</h3>
            <input
              style={searchStyle}
              placeholder="Filter agents…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand) 45%, var(--border))"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--brand) 14%, transparent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>

          <div className="mcp-grid">
            <div className="mcp-list agents-list" style={{ gap: 0 }}>
              {groups.user.length > 0 && <GroupHdr>User agents</GroupHdr>}
              {groups.user.map((a) => <AgentRowBtn key={a.id} agent={a} isActive={a.id === active?.id} onSelect={() => setActiveId(a.id)} />)}

              {groups.project.length > 0 && <GroupHdr>Project agents</GroupHdr>}
              {groups.project.map((a) => <AgentRowBtn key={a.id} agent={a} isActive={a.id === active?.id} onSelect={() => setActiveId(a.id)} />)}

              {groups.plugin.length > 0 && <GroupHdr>Plugin agents</GroupHdr>}
              {groups.plugin.map((a) => <AgentRowBtn key={a.id} agent={a} isActive={a.id === active?.id} onSelect={() => setActiveId(a.id)} />)}

              {groups.builtin.length > 0 && <GroupHdr>Built-in agents <span className="gh-note">always available</span></GroupHdr>}
              {groups.builtin.map((a) => <AgentRowBtn key={a.id} agent={a} isActive={a.id === active?.id} onSelect={() => setActiveId(a.id)} />)}

              {filtered.length === 0 && !loading && (
                <div className="mcp-empty" style={{ textAlign: "center", padding: "24px 12px" }}>No matches.</div>
              )}
            </div>

            {active
              ? <AgentDetail agent={active} onChange={refresh} onDeleted={() => { setActiveId(null); void refresh(); }} />
              : <div className="mcp-empty">Select an agent to view details.</div>}
          </div>
        </>
      )}

      {createOpen && (
        <AgentCreateModal
          onClose={() => setCreateOpen(false)}
          onCreated={(id) => { setCreateOpen(false); setActiveId(id); void refresh(); }}
        />
      )}
    </div>
  );
}

function GroupHdr({ children }: { children: React.ReactNode }) {
  return <div className="agents-group-hdr">{children}</div>;
}

function AgentRowBtn({ agent, isActive, onSelect }: { agent: AgentRow; isActive: boolean; onSelect: () => void }) {
  return (
    <button onClick={onSelect} className={`agent-row${isActive ? " is-active" : ""}`} aria-pressed={isActive}>
      <span className="agent-row-name" title={agent.name}>
        {agent.plugin ? <span className="scope-dim">{agent.plugin}:</span> : null}{agent.name}
      </span>
      <span className="agent-row-meta">
        <ModelBadge model={agent.model} />
      </span>
    </button>
  );
}

function ModelBadge({ model }: { model: string }) {
  const m = model.toLowerCase();
  const tone = m === "opus" ? "opus" : m === "sonnet" ? "sonnet" : m === "haiku" ? "haiku" : "inherit";
  return <span className={`model-badge tone-${tone}`}>{model}</span>;
}

function StatCard({ label, value, foot, accent = false, flashKey }: { label: string; value: number; foot: string; accent?: boolean; flashKey: number }) {
  return (
    <div className={`metric-card${accent ? " is-accent" : ""}`}>
      <div className="mc-glow" />
      <div className="mc-sheen" key={flashKey} />
      <div className="mc-label">{label}</div>
      <div className="mc-value">{value.toLocaleString()}</div>
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
