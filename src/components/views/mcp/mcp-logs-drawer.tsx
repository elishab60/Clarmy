"use client";

import { useEffect, useRef, useState } from "react";

export function McpLogsDrawer({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const [lines, setLines] = useState<string[]>([]);
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/mcp/${encodeURIComponent(serverId)}/logs?lines=300`, { cache: "no-store" });
        const j = (await r.json()) as { lines: string[] };
        if (!cancelled) setLines(j.lines);
      } catch { /* */ }
    };
    tick();
    const t = setInterval(tick, 2000);
    return () => { cancelled = true; clearInterval(t); };
  }, [serverId]);

  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [lines]);

  return (
    <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 560, background: "var(--bg-elev)", borderLeft: "1px solid var(--border)", zIndex: 90, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: 12, borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ fontSize: 13 }}>{serverId} · logs</strong>
        <span style={{ fontSize: 11, color: "var(--fg-muted)" }}>{lines.length} lines · polling 2s</span>
        <button className="btn" style={{ marginLeft: "auto" }} onClick={onClose}>Close</button>
      </div>
      <pre ref={ref} style={{ flex: 1, overflow: "auto", padding: 12, margin: 0, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-dim)", whiteSpace: "pre-wrap" }}>
        {lines.length ? lines.join("\n") : "(no logs matching this server name in ~/.claude/debug/)"}
      </pre>
    </div>
  );
}
