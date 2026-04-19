"use client";

import { useState } from "react";

export function McpImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [json, setJson] = useState('{\n  "mcpServers": {\n    \n  }\n}');
  const [overwrite, setOverwrite] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: string[]; skipped: string[] } | null>(null);

  const submit = async () => {
    setErr(null);
    try {
      const r = await fetch("/api/mcp/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ json, overwrite }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setResult({ added: j.added, skipped: j.skipped });
      if (j.skipped.length === 0) onDone();
    } catch (e) { setErr(String(e)); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 15 }}>Import MCP config</h2>
        <p style={{ fontSize: 12, color: "var(--fg-dim)", margin: "0 0 10px" }}>Paste a JSON object with an <code>mcpServers</code> key.</p>
        <textarea value={json} onChange={(e) => setJson(e.target.value)} rows={14} style={{ width: "100%", background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg)", padding: 10, fontFamily: "var(--font-mono)", fontSize: 11.5 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12 }}>
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
          Overwrite existing servers with same name
        </label>
        {err && <div style={{ color: "var(--state-error)", fontSize: 12, marginTop: 10 }}>{err}</div>}
        {result && (
          <div style={{ fontSize: 12, marginTop: 10, color: "var(--fg-dim)" }}>
            Added: {result.added.join(", ") || "(none)"}<br />
            Skipped: {result.skipped.join(", ") || "(none)"}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Close</button>
          <button className="btn primary" onClick={submit}>Import</button>
        </div>
      </div>
    </div>
  );
}
