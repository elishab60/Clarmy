"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { SessionSnapshot } from "@/lib/shared/types";
import { STATE_META } from "../shell/state-meta";
import { TileRunning } from "./tile-running";
import { TileToolUse } from "./tile-tool-use";
import { TileApproval } from "./tile-approval";
import { TileIdle } from "./tile-idle";
import { TileError } from "./tile-error";
import { TileDone } from "./tile-done";
import { PtyTerminal } from "../terminal/pty-terminal";

function fmtCost(n: number): string {
  if (!n) return "$0.00";
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function elapsedFrom(startedAt: number): string {
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Tile({ s }: { s: SessionSnapshot }) {
  const router = useRouter();
  const meta = STATE_META[s.state];
  const live = s.state === "running" || s.state === "tool_use" || s.state === "approval";
  const [, forceTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [killing, setKilling] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!live) return;
    tickRef.current = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [live]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: Event) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const elapsed = live ? elapsedFrom(s.startedAt) : s.elapsed;
  const isDead = s.state === "done" || s.state === "error";

  const stateClass = `s-${s.state.replace("_", "-")}`;
  const open = () => router.push(`/focus/${s.id}`);
  const stop = (e: MouseEvent) => e.stopPropagation();

  async function handleKill(e: MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    const verb = isDead ? "Delete" : "Kill";
    if (!window.confirm(`${verb} session ${s.id}?`)) return;
    setKilling(true);
    try {
      await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
    } finally {
      setKilling(false);
    }
  }

  return (
    <div
      className={`tile ${stateClass}`}
      style={{ ["--state-color" as string]: meta.cssVar }}
      onClick={open}
      role="button"
    >
      <div className="tile-head">
        <span className="sdot" />
        <div className="tile-title">
          <span className="path">{s.project}/</span>{s.name}
        </div>
        <span className="tile-model">{s.model}</span>
        <div className="tile-kebab-wrap" ref={menuRef} onClick={stop}>
          <button
            className="tile-kebab"
            onClick={(e) => { e.stopPropagation(); setMenuOpen((v) => !v); }}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >⋯</button>
          {menuOpen && (
            <div className="tile-menu" role="menu">
              <button
                role="menuitem"
                className="danger"
                disabled={killing}
                onClick={handleKill}
              >
                {killing ? "Killing…" : isDead ? "Delete" : "Kill"}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="tile-status">
        <span className="state">{meta.label}</span>
        {s.tool && <><span className="dot-sep">·</span><span className="tool">{s.tool}</span></>}
        <span className="elapsed">{elapsed}</span>
      </div>

      <div className="tile-body" onClick={(e) => { if (s.id.startsWith("s_")) e.stopPropagation(); }}>
        {s.id.startsWith("s_") && s.state !== "done" && s.state !== "error" ? (
          <PtyTerminal sessionId={s.id} compact />
        ) : (
          <>
            {s.state === "running"  && <TileRunning s={s} />}
            {s.state === "tool_use" && <TileToolUse s={s} />}
            {s.state === "approval" && <TileApproval s={s} />}
            {s.state === "idle"     && <TileIdle s={s} />}
            {s.state === "error"    && <TileError s={s} />}
            {s.state === "done"     && <TileDone s={s} />}
          </>
        )}
      </div>

      <div className="tile-foot">
        <span>⟳ {s.toolsUsed} tools</span>
        <span>✓ {s.todosDone}/{s.todos} todos</span>
        <span className="cost">{fmtCost(s.cost)}</span>
      </div>
    </div>
  );
}
