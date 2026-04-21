"use client";

import { useEffect, useState } from "react";
import type { ServerRow } from "../mcp-page";

export function McpConfigureModal({ server, onClose, onSaved }: { server: ServerRow; onClose: () => void; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const initial = JSON.stringify({
      name: server.name,
      command: server.command,
      args: server.args,
      transport: server.transport,
      timeoutMs: server.timeoutMs,
      envKeys: server.envKeys,
    }, null, 2);
    setText(initial);
    setDirty(false);
    setErr(null);
  }, [server]);

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const r = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => ({ error: `HTTP ${r.status}` }))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.58)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        animation: "fade-in .2s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${server.name}`}
        style={{
          width: 620, maxWidth: "92vw", maxHeight: "88vh",
          background: "var(--bg-elev)", border: "1px solid var(--border-strong)",
          borderRadius: 10, padding: 24,
          display: "flex", flexDirection: "column", gap: 16,
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
        }}
      >
        <header style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Configure</h2>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>{server.name}</span>
        </header>

        <label style={{ fontSize: 12, fontWeight: 500, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
          Server JSON
        </label>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setDirty(true); }}
          spellCheck={false}
          rows={18}
          style={{
            width: "100%", resize: "vertical", minHeight: 280, maxHeight: "55vh",
            background: "var(--bg)", color: "var(--fg)",
            border: "1px solid var(--border)", borderRadius: 6,
            padding: 12, fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.55,
          }}
        />

        {err && (
          <div style={{ color: "var(--state-error)", fontSize: 12, padding: "8px 10px", background: "rgba(239,68,68,0.08)", borderRadius: 6 }}>
            {err}
          </div>
        )}

        <footer style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={() => void save()} disabled={busy || !dirty}>
            {busy ? "Saving…" : "Save"}
          </button>
        </footer>
      </div>
    </div>
  );
}
