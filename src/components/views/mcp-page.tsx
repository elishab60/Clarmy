"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { McpDetail } from "./mcp/mcp-detail";
import { McpAddModal } from "./mcp/mcp-add-modal";
import { McpImportModal } from "./mcp/mcp-import-modal";
import { McpConfigureModal } from "./mcp/mcp-configure-modal";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { EmptyState } from "@/components/ui/empty-state";

export interface ServerRow {
  id: string; name: string; status: "on" | "off";
  command: string; args: string[]; transport: string; timeoutMs: number;
  envKeys: string[]; callCount: number; okCount: number; errCount: number;
  lastTs: number | null; toolCount: number;
}

export function McpPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qFocused, setQFocused] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [configureId, setConfigureId] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState(0);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/mcp", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { servers: ServerRow[] };
      setServers(data.servers);
      setErr(null);
      setFlashKey((k) => k + 1);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 15000); return () => clearInterval(t); }, [refresh]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return servers.filter((s) => !qq || s.name.toLowerCase().includes(qq) || s.command.toLowerCase().includes(qq));
  }, [servers, q]);

  const active = servers.find((s) => s.id === activeId) ?? filtered[0] ?? null;

  const totals = useMemo(() => {
    const enabled = servers.filter((s) => s.status === "on").length;
    const tools = servers.reduce((a, s) => a + (s.toolCount || 0), 0);
    const calls = servers.reduce((a, s) => a + (s.callCount || 0), 0);
    return { count: servers.length, enabled, tools, calls };
  }, [servers]);

  const maxCalls = useMemo(() => Math.max(1, ...servers.map((s) => s.callCount || 0)), [servers]);

  const onToggle = async (id: string) => {
    await fetch("/api/mcp/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId: id }) });
    refresh();
  };
  const onDelete = async (id: string) => {
    if (!confirm(`Delete MCP server "${id}"?`)) return;
    await fetch(`/api/mcp/${encodeURIComponent(id)}`, { method: "DELETE" });
    setActiveId(null);
    refresh();
  };

  const searchStyle: CSSProperties = {
    transition: "border-color .2s, box-shadow .2s",
    borderColor: qFocused ? "color-mix(in srgb, var(--brand) 55%, var(--border))" : undefined,
    boxShadow: qFocused ? "0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent)" : undefined,
  };

  return (
    <div className="cfg-shell metrics-shell">
      <div className="cfg-header">
        <div>
          <h1>MCP servers</h1>
          <p className="sub">Configure Model Context Protocol servers available to your sessions.</p>
        </div>
        <div className="right">
          <button
            className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`}
            onClick={() => void refresh()}
            disabled={loading}
            aria-label="Refresh MCP servers"
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
          <button className="btn" onClick={() => setImportOpen(true)}>Import config</button>
          <button
            className="btn primary"
            onClick={() => setAddOpen(true)}
            style={{ transition: "transform .2s, box-shadow .2s, border-color .2s" }}
          >
            Add server
          </button>
        </div>
      </div>

      {err && <div style={{ padding: 12, background: "rgba(239,68,68,0.08)", color: "var(--state-error)", borderRadius: 4, marginBottom: 12, fontSize: 12 }}>Error: {err}</div>}

      {loading && servers.length === 0 ? (
        <div className="stat-grid">
          {Array.from({ length: 5 }).map((_, i) => <div key={i} className="metric-skel" />)}
        </div>
      ) : (
        <div className="stat-grid">
          <StatCard flashKey={flashKey} label="Servers"      value={totals.count}   foot={`${filtered.length} shown`} />
          <StatCard flashKey={flashKey} label="Enabled"      value={totals.enabled} foot={`${totals.count - totals.enabled} off`} accent />
          <StatCard flashKey={flashKey} label="Tools"        value={totals.tools}   foot="across all servers" />
          <StatCard flashKey={flashKey} label="Calls"        value={totals.calls}   foot="lifetime invocations" />
          <StatCard flashKey={flashKey} label="Active"       value={active ? 1 : 0} foot={active?.name ?? "none selected"} />
        </div>
      )}

      <h3 className="metric-h">Servers</h3>

      <div className="mcp-grid">
        <div className="mcp-list">
          <input
            className="search"
            placeholder="Filter servers…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setQFocused(true)}
            onBlur={() => setQFocused(false)}
            style={searchStyle}
          />
          {filtered.map((s, i) => {
            const t = (s.callCount || 0) / maxCalls;
            const isActive = s.id === active?.id;
            const isHover = hoverId === s.id;
            const wrapStyle: CSSProperties = {
              position: "relative",
              borderRadius: "var(--radius)",
              animation: "metric-rise .55s cubic-bezier(.2,.7,.2,1) both",
              animationDelay: `${Math.min(i, 10) * 30}ms`,
              transform: isHover ? "translateX(1px)" : "translateX(0)",
              transition: "transform .2s cubic-bezier(.2,.7,.2,1), background .2s",
              background: isHover
                ? `color-mix(in srgb, var(--brand) ${4 + t * 6}%, transparent)`
                : "transparent",
              boxShadow: isHover
                ? `inset 2px 0 0 color-mix(in srgb, var(--brand) ${40 + t * 55}%, transparent)`
                : "inset 2px 0 0 transparent",
            };
            const dotStyle: CSSProperties = {
              transition: "transform .25s cubic-bezier(.2,.7,.2,1), box-shadow .25s",
              transform: isHover && s.status === "on" ? "scale(1.35)" : "scale(1)",
              boxShadow: s.status === "on"
                ? `0 0 ${isHover ? 10 : 4}px color-mix(in srgb, var(--state-done) ${isHover ? 80 : 45}%, transparent)`
                : "none",
            };
            return (
              <div
                key={s.id}
                style={wrapStyle}
                onMouseEnter={() => setHoverId(s.id)}
                onMouseLeave={() => setHoverId((h) => (h === s.id ? null : h))}
              >
                <button
                  className={`mcp-item ${isActive ? "active" : ""}`}
                  onClick={() => setActiveId(s.id)}
                  style={{ background: "transparent" }}
                  title={s.name}
                >
                  <span className={`mcp-dot ${s.status}`} style={dotStyle} />
                  <div className="meta">
                    <span className="name">{s.name}</span>
                    <span className="desc" title={s.command}>{s.command}</span>
                  </div>
                  <span className="tool-count" title={`${s.toolCount} tools · ${s.callCount} calls`}>{s.toolCount || s.callCount}</span>
                </button>
                <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 8, right: 8 }}>
                  <KebabMenu
                    ariaLabel={`Actions for ${s.name}`}
                    actions={[
                      { label: "Configure", onSelect: () => { setActiveId(s.id); setConfigureId(s.id); } },
                      { label: s.status === "on" ? "Disable" : "Enable", onSelect: () => { void onToggle(s.id); } },
                      { label: "Delete", danger: true, onSelect: () => { void onDelete(s.id); } },
                    ]}
                  />
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && !loading && (
            <EmptyState
              icon={<ServerIcon />}
              title="No MCP servers configured"
              subtitle="Add a server to extend Claude's capabilities with external tools and data sources."
              action={<button className="btn primary" onClick={() => setAddOpen(true)}>Add server</button>}
            />
          )}
        </div>

        {active
          ? <McpDetail
              server={active}
              onToggle={() => onToggle(active.id)}
              onDelete={() => onDelete(active.id)}
              onRefresh={refresh}
              onConfigure={() => setConfigureId(active.id)}
            />
          : servers.length === 0 ? null : <div className="mcp-empty">Select a server to view details.</div>}
      </div>

      {addOpen && <McpAddModal onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); refresh(); }} />}
      {importOpen && <McpImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); refresh(); }} />}
      {configureId && servers.find((s) => s.id === configureId) && (
        <McpConfigureModal
          server={servers.find((s) => s.id === configureId)!}
          onClose={() => setConfigureId(null)}
          onSaved={() => { setConfigureId(null); refresh(); }}
        />
      )}
    </div>
  );
}

function ServerIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <circle cx="7" cy="7" r="0.8" fill="currentColor" />
      <circle cx="7" cy="17" r="0.8" fill="currentColor" />
    </svg>
  );
}

function StatCard({ label, value, foot, accent = false, flashKey }: { label: string; value: number; foot: string; accent?: boolean; flashKey: number }) {
  return (
    <div className={`metric-card${accent ? " is-accent" : ""}`}>
      <div className="mc-glow" />
      <div className="mc-sheen" key={flashKey} />
      <div className="mc-label">{label}</div>
      <div className="mc-value"><AnimatedNumber value={value} /></div>
      <div className="mc-foot">{foot}</div>
    </div>
  );
}

function AnimatedNumber({ value }: { value: number }) {
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
  return <>{Math.round(display).toLocaleString()}</>;
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3h-3" />
    </svg>
  );
}
