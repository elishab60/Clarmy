"use client";

import { useCockpit } from "@/lib/client/store";
import { STATE_META, STATE_ORDER } from "./state-meta";
import type { SessionState } from "@/lib/shared/types";

export function Statusbar() {
  const sessions = useCockpit((s) => s.sessions);
  const connected = useCockpit((s) => s.connected);
  const setTweaksOpen = useCockpit((s) => s.setTweaksOpen);

  const counts: Record<SessionState, number> = {
    running: 0, tool_use: 0, approval: 0, error: 0, idle: 0, done: 0,
  };
  for (const s of Object.values(sessions)) counts[s.state]++;

  return (
    <>
      <footer className="statusbar">
        <div className="sb-group">
          {STATE_ORDER.map((k) => (
            <span key={k} className="sb-pill">
              <span className="sdot" style={{ background: STATE_META[k].color }} />
              <span>{STATE_META[k].label} {counts[k]}</span>
            </span>
          ))}
        </div>
        <div className="sb-sep" />
        <span className="sb-pill"><span>claude-code v1.42.0</span></span>
        <div className="sb-right">
          <span className={`ws-indicator ${connected ? "" : "offline"}`}>
            <span className="rdot" />
            {connected ? "websocket · connected" : "websocket · offline"}
          </span>
        </div>
      </footer>
      <button className="tweaks-fab" onClick={() => setTweaksOpen(true)} aria-label="Open tweaks">✦</button>
    </>
  );
}
