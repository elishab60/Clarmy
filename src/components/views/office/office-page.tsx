"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCockpit } from "@/lib/client/store";
import { PtyTerminal } from "@/components/terminal/pty-terminal";
import { STATE_META } from "@/components/shell/state-meta";
import { OfficeHud } from "./office-hud";

// Phaser only exists client-side; load the whole game bundle on demand so the
// rest of CLARMY never pays for it.
const OfficeCanvas = dynamic(
  () => import("./office-canvas").then((m) => m.OfficeCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="office-loading">
        <span className="office-loading-title">booting the office…</span>
        <span className="office-loading-hint">first visit compiles Phaser — ~10s</span>
      </div>
    ),
  },
);

const PANEL_KEY = "cockpit:office-panel-pct";

function fmtCost(n: number): string {
  return n >= 100 ? `$${n.toFixed(0)}` : `$${n.toFixed(2)}`;
}

function fmtElapsed(startedAt: number, endedAt?: number): string {
  const total = Math.max(0, Math.floor(((endedAt ?? Date.now()) - startedAt) / 1000));
  const m = Math.floor(total / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h${m % 60}m` : `${m}m${(total % 60).toString().padStart(2, "0")}s`;
}

export function OfficePage() {
  const router = useRouter();
  const sessions = useCockpit((s) => s.sessions);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPrompts, setShowPrompts] = useState(false);
  const [recenterKey, setRecenterKey] = useState(0);
  const [panelPct, setPanelPct] = useState(() => {
    if (typeof window === "undefined") return 42;
    const v = Number(localStorage.getItem(PANEL_KEY));
    return Number.isFinite(v) && v >= 25 && v <= 65 ? v : 42;
  });
  const shellRef = useRef<HTMLDivElement | null>(null);

  const list = useMemo(() => Object.values(sessions), [sessions]);
  const selected = selectedId ? sessions[selectedId] ?? null : null;
  const onSelect = useCallback((id: string | null) => setSelectedId(id), []);

  // Esc closes the terminal panel
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelectedId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Drag the divider to resize the panel; persisted across visits.
  const onHandleDown = useCallback((down: React.PointerEvent) => {
    down.preventDefault();
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const move = (e: PointerEvent) => {
      const pct = Math.min(65, Math.max(25, ((rect.right - e.clientX) / rect.width) * 100));
      setPanelPct(pct);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setPanelPct((v) => { try { localStorage.setItem(PANEL_KEY, String(Math.round(v))); } catch { /* ignore */ } return v; });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, []);

  const live = selected && selected.id.startsWith("s_") && selected.state !== "done" && selected.state !== "error";
  const meta = selected ? STATE_META[selected.state] : null;

  return (
    <div className="office-shell" ref={shellRef}>
      <div className="office-main">
        <OfficeCanvas onSelect={onSelect} selectedId={selectedId} showPrompts={showPrompts} recenterKey={recenterKey} />
        <OfficeHud
          sessions={list}
          showPrompts={showPrompts}
          onTogglePrompts={() => setShowPrompts((v) => !v)}
          onRecenter={() => setRecenterKey((k) => k + 1)}
        />
        {list.length === 0 && (
          <div className="office-empty">
            <div className="office-empty-card">
              <span className="glyph">⌁</span>
              <strong>The office is empty.</strong>
              <span>Spawn a session and an agent will walk in.</span>
            </div>
          </div>
        )}
      </div>

      {selected && meta && (
        <div className="office-term" style={{ width: `${panelPct}%` }}>
          <div className="office-term-handle" onPointerDown={onHandleDown} role="separator" aria-orientation="vertical" />
          <div className="office-term-head">
            <span className="sdot" style={{ background: meta.color }} />
            <strong>{selected.project}/</strong>
            <span className="oth-name">{selected.name}</span>
            <span className="oth-meta">{selected.model} · {meta.label} · {fmtCost(selected.cost)} · {fmtElapsed(selected.startedAt, selected.endedAt)}</span>
            <button className="btn oth-open" onClick={() => router.push(`/focus/${selected.id}`)}>Open in Sessions</button>
            <button className="oth-close" onClick={() => setSelectedId(null)} aria-label="Close terminal">✕</button>
          </div>
          <div className="office-term-body" key={selected.id}>
            {live ? (
              <PtyTerminal sessionId={selected.id} />
            ) : (
              <div className="office-term-dead">
                <div className="muted">session {selected.id} · {meta.label} · terminal detached</div>
                <br />
                {selected.logs.slice(-40).map((l, i) => (
                  <div key={i} className={l.t === "gt" ? "" : l.t}>{l.t === "gt" ? `› ${l.v}` : l.v}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
