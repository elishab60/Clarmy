"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { McpDetail } from "./mcp/mcp-detail";
import { McpAddModal } from "./mcp/mcp-add-modal";
import { McpImportModal } from "./mcp/mcp-import-modal";

export interface ServerRow {
  id: string; name: string; status: "on" | "off";
  command: string; args: string[]; transport: string; timeoutMs: number;
  envKeys: string[]; callCount: number; okCount: number; errCount: number;
  lastTs: number | null; toolCount: number;
}

export function McpPage() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/mcp", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { servers: ServerRow[] };
      setServers(data.servers);
      setErr(null);
    } catch (e) { setErr(String(e)); } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, [refresh]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return servers.filter((s) => !qq || s.name.toLowerCase().includes(qq) || s.command.toLowerCase().includes(qq));
  }, [servers, q]);

  const active = servers.find((s) => s.id === activeId) ?? filtered[0] ?? null;

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

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>MCP servers</h1>
          <p className="sub">Configure Model Context Protocol servers available to your sessions.</p>
        </div>
        <div className="right">
          <button className="btn" onClick={() => setImportOpen(true)}>Import config</button>
          <button className="btn primary" onClick={() => setAddOpen(true)}>Add server</button>
        </div>
      </div>

      {err && <div style={{ padding: 12, background: "rgba(239,68,68,0.08)", color: "var(--state-error)", borderRadius: 4, marginBottom: 12, fontSize: 12 }}>Error: {err}</div>}

      <div className="mcp-grid">
        <div className="mcp-list">
          <input className="search" placeholder="Filter servers…" value={q} onChange={(e) => setQ(e.target.value)} />
          {filtered.map((s) => (
            <button key={s.id} className={`mcp-item ${s.id === active?.id ? "active" : ""}`} onClick={() => setActiveId(s.id)}>
              <span className={`mcp-dot ${s.status}`} />
              <div className="meta">
                <span className="name">{s.name}</span>
                <span className="desc">{s.command}</span>
              </div>
              <span className="tool-count">{s.toolCount || s.callCount}</span>
            </button>
          ))}
          {filtered.length === 0 && !loading && <div style={{ padding: 24, textAlign: "center", color: "var(--fg-muted)", fontSize: 11.5 }}>No servers.</div>}
        </div>

        {active && <McpDetail server={active} onToggle={() => onToggle(active.id)} onDelete={() => onDelete(active.id)} onRefresh={refresh} />}
      </div>

      {addOpen && <McpAddModal onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); refresh(); }} />}
      {importOpen && <McpImportModal onClose={() => setImportOpen(false)} onDone={() => { setImportOpen(false); refresh(); }} />}
    </div>
  );
}
