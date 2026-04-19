"use client";

import { useCockpit } from "@/lib/client/store";
import { Tile } from "../tile/tile";
import { STATE_META, STATE_ORDER } from "../shell/state-meta";
import type { SessionState, SessionSnapshot } from "@/lib/shared/types";

function Pane({ theme, label }: { theme: "dark" | "light"; label: string }) {
  const sessions = useCockpit((s) => s.sessions);
  const order = useCockpit((s) => s.order);
  const list = order.map((id) => sessions[id]).filter((v): v is NonNullable<typeof v> => Boolean(v));
  const counts: Record<SessionState, number> = { running: 0, tool_use: 0, approval: 0, error: 0, idle: 0, done: 0 };
  for (const s of list) counts[s.state]++;

  return (
    <div className="compare-pane" data-nested-theme={theme} data-theme={theme}>
      <div className="pane-label">
        <span>{label}</span>
        <span style={{ marginLeft: "auto", color: "var(--fg-muted)" }}>{list.length} tiles · {theme}</span>
      </div>
      <div className="pane-body">
        <div className="grid" style={{ ["--cols" as string]: "2" }}>
          {list.slice(0, 6).map((s: SessionSnapshot) => <Tile key={s.id} s={s} />)}
        </div>
      </div>
      <div className="statusbar" style={{ gridArea: "unset" }}>
        <div className="sb-group">
          {STATE_ORDER.map((k) => (
            <span key={k} className="sb-pill">
              <span className="sdot" style={{ width: 6, height: 6, borderRadius: "50%", background: STATE_META[k].color }} />
              <span>{STATE_META[k].label} {counts[k]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ThemeAb() {
  return (
    <div className="compare-shell">
      <Pane theme="dark" label="Dark · default" />
      <Pane theme="light" label="Light · warm off-white" />
    </div>
  );
}
