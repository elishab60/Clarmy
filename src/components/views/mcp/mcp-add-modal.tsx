"use client";

import { useState } from "react";

export function McpAddModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("-y @modelcontextprotocol/server-filesystem ~/code");
  const [env, setEnv] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const envObj: Record<string, string> = {};
      for (const line of env.split("\n")) {
        const i = line.indexOf("=");
        if (i > 0) envObj[line.slice(0, i).trim()] = line.slice(i + 1).trim();
      }
      const r = await fetch("/api/mcp", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, command, args: args.split(/\s+/).filter(Boolean), env: envObj, transport: "stdio" }),
      });
      if (!r.ok) { const j = await r.json().catch(() => ({ error: `${r.status}` })); throw new Error(j.error); }
      onDone();
    } catch (e) { setErr(String(e)); } finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 560, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15 }}>Add MCP server</h2>
        <div className="field-grid">
          <div className="k">Name</div>
          <div className="v"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. filesystem" /></div>
          <div className="k">Command</div>
          <div className="v"><input value={command} onChange={(e) => setCommand(e.target.value)} /></div>
          <div className="k">Args</div>
          <div className="v"><input value={args} onChange={(e) => setArgs(e.target.value)} /></div>
          <div className="k">Env (KEY=VAL per line)</div>
          <div className="v"><textarea value={env} onChange={(e) => setEnv(e.target.value)} rows={3} style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)", padding: 6, fontFamily: "var(--font-mono)", fontSize: 11.5 }} /></div>
        </div>
        {err && <div style={{ color: "var(--state-error)", fontSize: 12, marginTop: 10 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy || !name || !command}>Add</button>
        </div>
      </div>
    </div>
  );
}
