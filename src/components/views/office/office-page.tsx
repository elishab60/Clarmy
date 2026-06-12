"use client";

import { useCallback, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useCockpit } from "@/lib/client/store";
import { OfficeHud } from "./office-hud";
import { SessionInspector } from "./session-inspector";

// Phaser only exists client-side; load the whole game bundle on demand so the
// rest of CLARMY never pays for it.
const OfficeCanvas = dynamic(() => import("./office-canvas").then((m) => m.OfficeCanvas), {
  ssr: false,
  loading: () => <div className="office-loading">booting the office…</div>,
});

export function OfficePage() {
  const sessions = useCockpit((s) => s.sessions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);

  const list = useMemo(() => Object.values(sessions), [sessions]);
  const selected = selectedId ? sessions[selectedId] ?? null : null;
  const onSelect = useCallback((id: string) => setSelectedId(id), []);

  return (
    <div className="office-shell">
      <OfficeCanvas onSelect={onSelect} showPrompts={showPrompts} recenterKey={recenterKey} />
      <OfficeHud
        sessions={list}
        showPrompts={showPrompts}
        onTogglePrompts={() => setShowPrompts((v) => !v)}
        onRecenter={() => setRecenterKey((k) => k + 1)}
      />
      {selected && <SessionInspector session={selected} onClose={() => setSelectedId(null)} />}
      {list.length === 0 && (
        <div className="office-empty">
          <div className="office-empty-card">
            <span className="glyph">⌁</span>
            <strong>The office is empty.</strong>
            <span>Spawn a session and a clawd will walk in.</span>
          </div>
        </div>
      )}
    </div>
  );
}
