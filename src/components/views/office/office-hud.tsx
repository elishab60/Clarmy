"use client";

import type { SessionSnapshot, SessionState } from "@/lib/shared/types";
import { STATE_META } from "@/components/shell/state-meta";

const ORDER: SessionState[] = ["running", "tool_use", "approval", "error", "idle", "done"];

// Same numbers as the dashboard status bar, floating over the office.
export function OfficeHud({
  sessions,
  showPrompts,
  onTogglePrompts,
  onRecenter,
}: {
  sessions: readonly SessionSnapshot[];
  showPrompts: boolean;
  onTogglePrompts: () => void;
  onRecenter: () => void;
}) {
  const counts = new Map<SessionState, number>();
  for (const s of sessions) counts.set(s.state, (counts.get(s.state) ?? 0) + 1);
  const cost = sessions.reduce((a, s) => a + s.cost, 0);

  return (
    <div className="office-hud">
      <div className="office-hud-counts">
        {ORDER.map((st) => (
          <span key={st} className="office-hud-chip" title={STATE_META[st].label}>
            <span className="dot" style={{ background: STATE_META[st].color }} />
            {STATE_META[st].label} {counts.get(st) ?? 0}
          </span>
        ))}
      </div>
      <div className="office-hud-right">
        <span className="office-hud-cost">{sessions.length} sessions · ${cost.toFixed(2)}</span>
        <button className="btn" onClick={onTogglePrompts}>{showPrompts ? "prompts on" : "prompts off"}</button>
        <button className="btn" onClick={onRecenter}>recenter</button>
      </div>
    </div>
  );
}
