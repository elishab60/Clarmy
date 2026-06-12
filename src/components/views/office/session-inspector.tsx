"use client";

import { useRouter } from "next/navigation";
import type { SessionSnapshot } from "@/lib/shared/types";
import { STATE_META } from "@/components/shell/state-meta";
import { contextWindowFor } from "@/lib/shared/models";

function fmtElapsed(s: SessionSnapshot): string {
  const end = s.endedAt ?? Date.now();
  const total = Math.max(0, Math.floor((end - s.startedAt) / 1000));
  const m = Math.floor(total / 60);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${total % 60}s`;
}

// React overlay (never drawn in the canvas): live data for the character the
// user clicked, plus a jump to the real session view.
export function SessionInspector({ session, onClose }: { session: SessionSnapshot; onClose: () => void }) {
  const router = useRouter();
  const meta = STATE_META[session.state];
  const ctxMax = session.contextWindow || contextWindowFor(session.model);
  const ctxPct = session.contextTokens && ctxMax ? Math.min(100, (session.contextTokens / ctxMax) * 100) : null;

  return (
    <div className="office-inspector">
      <div className="oi-head">
        <span className="sdot" style={{ background: meta.color }} />
        <strong>{session.project}/</strong> {session.name}
        <button className="oi-close" onClick={onClose} aria-label="Close">✕</button>
      </div>
      <div className="oi-grid">
        <span className="k">id</span><span className="v">{session.id}</span>
        <span className="k">model</span><span className="v">{session.model}</span>
        <span className="k">state</span><span className="v" style={{ color: meta.color }}>{meta.label}</span>
        <span className="k">elapsed</span><span className="v">{fmtElapsed(session)}</span>
        <span className="k">cost</span><span className="v">${session.cost.toFixed(2)}</span>
        <span className="k">context</span><span className="v">{ctxPct === null ? "—" : `${ctxPct.toFixed(0)}%`}</span>
        <span className="k">tools</span><span className="v">{session.toolsUsed}</span>
        <span className="k">todos</span><span className="v">{session.todosDone} / {session.todos}</span>
        {typeof session.subagents === "number" && session.subagents > 0 && (
          <><span className="k">subagents</span><span className="v">{session.subagents}</span></>
        )}
      </div>
      {session.prompt && <div className="oi-prompt">{session.prompt.slice(0, 220)}</div>}
      <button className="btn primary oi-jump" onClick={() => router.push(`/focus/${session.id}`)}>
        Open session →
      </button>
    </div>
  );
}
