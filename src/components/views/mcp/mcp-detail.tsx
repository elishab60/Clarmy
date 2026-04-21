"use client";

import { useEffect, useState } from "react";
import type { ServerRow } from "../mcp-page";
import { McpLogsDrawer } from "./mcp-logs-drawer";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { KebabMenu } from "@/components/ui/kebab-menu";

interface Tool { name: string; callCount: number; lastTs: number | null; }

export function McpDetail({ server, onToggle, onDelete, onRefresh, onConfigure }: {
  server: ServerRow; onToggle: () => void; onDelete: () => void; onRefresh: () => void; onConfigure: () => void;
}) {
  const [tools, setTools] = useState<Tool[]>([]);
  const [probe, setProbe] = useState<{ ok?: boolean; tools?: string[]; latencyMs?: number; error?: string; skipped?: boolean; reason?: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);

  useEffect(() => {
    setProbe(null);
    fetch(`/api/mcp/${encodeURIComponent(server.id)}/tools`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { tools: [] })
      .then((j: { tools: Tool[] }) => setTools(j.tools))
      .catch(() => setTools([]));
  }, [server.id]);

  const runTest = async () => {
    setTesting(true);
    try {
      const r = await fetch("/api/mcp/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ serverId: server.id }) });
      setProbe(await r.json());
      onRefresh();
    } finally { setTesting(false); }
  };

  return (
    <div className="mcp-detail">
      <div className="row-h">
        <h2>{server.name}</h2>
        <span className="id">{server.transport} · timeout {server.timeoutMs}ms</span>
        {server.status === "on"  ? <span className="status-pill">enabled</span>
         : <span className="status-pill" style={{ color: "var(--fg-muted)", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px var(--border)" }}>disabled</span>}
        <div className="right-actions" style={{ alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={runTest} disabled={testing}>{testing ? "Testing…" : "Test connection"}</button>
          <button className="btn" onClick={() => setLogsOpen(true)}>View logs</button>
          <button className="btn primary" onClick={onConfigure}>Configure</button>
          <ToggleSwitch checked={server.status === "on"} onChange={onToggle} label={`${server.status === "on" ? "Disable" : "Enable"} ${server.name}`} />
          <KebabMenu
            ariaLabel={`More actions for ${server.name}`}
            actions={[
              { label: "Edit config", onSelect: onConfigure },
              { label: server.status === "on" ? "Disable" : "Enable", onSelect: onToggle },
              { label: "Delete", danger: true, onSelect: onDelete },
            ]}
          />
        </div>
      </div>

      {probe && (
        <div style={{ marginBottom: 14, padding: 10, borderRadius: 4, fontSize: 12, fontFamily: "var(--font-mono)",
          background: probe.skipped ? "rgba(255,255,255,0.04)" : probe.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
          color: probe.skipped ? "var(--fg-muted)" : probe.ok ? "var(--state-success, #22c55e)" : "var(--state-error)" }}>
          {probe.skipped ? `skipped: ${probe.reason}`
            : probe.ok ? `✓ ${probe.tools?.length ?? 0} tools · ${Math.round(probe.latencyMs ?? 0)}ms`
            : `✗ ${probe.error ?? "error"} · ${Math.round(probe.latencyMs ?? 0)}ms`}
        </div>
      )}

      <div className="field-grid">
        <div className="k">Command</div>
        <div className="v"><input defaultValue={[server.command, ...(server.args ?? [])].join(" ")} readOnly /></div>
        <div className="k">Transport</div>
        <div className="v"><input defaultValue={server.transport} readOnly style={{ maxWidth: 160 }} /></div>
        <div className="k">Env keys</div>
        <div className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-muted)", paddingTop: 8 }}>
          {server.envKeys.length ? server.envKeys.join(", ") : "(none)"}
        </div>
        <div className="k">Calls</div>
        <div className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg)", paddingTop: 8 }}>
          {server.callCount} total · {server.okCount} ok · {server.errCount} err {server.lastTs ? `· last ${new Date(server.lastTs).toLocaleString()}` : ""}
        </div>
      </div>

      <h3 style={{ margin: "0 0 10px", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-faint)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>Tools · {tools.length}</h3>
      <div className="tools-table">
        <div className="trow head"><span>name</span><span>last call</span><span style={{ textAlign: "right" }}>calls</span><span style={{ textAlign: "right" }}>&nbsp;</span></div>
        {tools.length === 0 && <div className="trow"><span className="tdesc" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)" }}>no tools discovered (try Test connection)</span></div>}
        {tools.map((t) => (
          <div key={t.name} className="trow">
            <span className="tname">{t.name}</span>
            <span className="tdesc">{t.lastTs ? new Date(t.lastTs).toLocaleString() : "—"}</span>
            <span className="ncalls">{t.callCount}</span>
            <span className="tperm auto">ready</span>
          </div>
        ))}
      </div>

      {logsOpen && <McpLogsDrawer serverId={server.id} onClose={() => setLogsOpen(false)} />}
    </div>
  );
}
