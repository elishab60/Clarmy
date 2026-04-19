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

  useEffect(() => {
    if (!live) return;
    tickRef.current = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [live]);

  const elapsed = live ? elapsedFrom(s.startedAt) : s.elapsed;

  const stateClass = `s-${s.state.replace("_", "-")}`;
  const open = () => router.push(`/focus/${s.id}`);
  const stop = (e: MouseEvent) => e.stopPropagation();

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
        <button className="tile-kebab" onClick={stop}>⋯</button>
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
        <span className="cost">${s.cost.toFixed(2)}</span>
      </div>
    </div>
  );
}
