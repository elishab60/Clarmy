"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCockpit } from "@/lib/client/store";
import type { Effort } from "@/lib/shared/types";
import { effortLevelsFor } from "@/lib/shared/models";
import { providerMeta } from "@/lib/shared/providers";
import { STATE_META } from "../shell/state-meta";
import { PtyTerminal } from "../terminal/pty-terminal";

function fmtCost(n: number): string {
  if (!n) return "$0.00";
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

function fmtElapsedMs(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
  return `${m.toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

export function FocusView({ id }: { id: string }) {
  const router = useRouter();
  const s = useCockpit((st) => st.sessions[id]);
  const [killing, setKilling] = useState(false);
  const [killError, setKillError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const isTicking = !!s && s.state !== "done" && s.state !== "error";
  useEffect(() => {
    if (!isTicking) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isTicking]);

  if (!s) {
    return (
      <div style={{ padding: 40, color: "var(--fg-muted)" }}>
        Session <strong>{id}</strong> not found. <button className="btn ghost" onClick={() => router.push("/")}>Back to dashboard</button>
      </div>
    );
  }

  const meta = STATE_META[s.state];
  const isOwned = s.id.startsWith("s_");
  const isActive = isOwned && s.state !== "done" && s.state !== "error";
  const effortLevels = effortLevelsFor(s.model);
  const effortSupported = effortLevels.length > 0;

  async function handleEffortChange(next: Effort) {
    if (!s || !isActive) return;
    try {
      await fetch(`/api/sessions/${s.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_effort", effort: next }),
      });
    } catch { /* ignore */ }
  }
  const canKill = true;
  const isDead = s.state === "done" || s.state === "error";

  async function handleKill() {
    if (!s || !canKill) return;
    const verb = isDead ? "delete" : "kill";
    if (!window.confirm(`${verb[0]!.toUpperCase()}${verb.slice(1)} session ${s.id}?`)) return;
    setKilling(true);
    setKillError(null);
    try {
      const res = await fetch(`/api/sessions/${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.push("/");
    } catch (err) {
      setKillError(err instanceof Error ? err.message : String(err));
      setKilling(false);
    }
  }

  return (
    <div className="focus-shell">
      <section className="focus-main">
        <div className="focus-header">
          <span className="sdot" style={{ background: meta.color }} />
          <span className="path">{s.project}/</span>
          <h2>{s.name}</h2>
          <div className="actions">
            <button>Pause</button>
            <button>Fork</button>
            {canKill && (
              <button
                className="danger"
                onClick={handleKill}
                disabled={killing}
                title={isDead ? "Remove this session from the registry" : "Stop this session and remove it"}
              >
                {killing ? "Killing…" : isDead ? "Delete" : "Kill"}
              </button>
            )}
            <button className="close" onClick={() => router.push("/")}>esc ✕</button>
          </div>
        </div>
        {killError && (
          <div className="focus-banner" style={{ padding: "6px 12px", fontSize: 12, color: "var(--state-error, #ef4444)" }}>
            Kill failed: {killError}
          </div>
        )}
        <div className="focus-body">
          {s.id.startsWith("s_") && s.state !== "done" && s.state !== "error" ? (
            <div className="focus-pty">
              <PtyTerminal sessionId={s.id} />
            </div>
          ) : (
            <div className="focus-term">
              <div className="head">› {s.name}</div>
              <div className="muted">session {s.id} · model {s.model} · state {meta.label}</div>
              <br />
              {s.logs.slice(-60).map((l, i) => (
                <div key={i}>
                  {l.t === "gt"    && <><span className="gt">›</span> <span>{l.v}</span></>}
                  {l.t === "ok"    && <span className="ok">{l.v}</span>}
                  {l.t === "warn"  && <span className="warn">{l.v}</span>}
                  {l.t === "muted" && <span className="muted">{l.v}</span>}
                  {l.t === "plain" && <span>{l.v}</span>}
                </div>
              ))}
              {s.state === "running" && <span className="cursor" />}
            </div>
          )}
        </div>
      </section>
      <aside className="focus-side">
        <div className="focus-side-group">
          <h3>Session</h3>
          <div className="kv-list">
            <div className="kv"><span className="k">id</span><span className="v">{s.id}</span></div>
            <div className="kv"><span className="k">provider</span><span className="v">{providerMeta(s.provider).label}</span></div>
            <div className="kv"><span className="k">model</span><span className="v">{s.model}</span></div>
            <div className="kv"><span className="k">state</span><span className="v" style={{ color: meta.color }}>{meta.label}</span></div>
            <div className="kv"><span className="k">tool</span><span className="v">{s.tool ?? "—"}</span></div>
            <div className="kv"><span className="k">elapsed</span><span className="v">{isTicking && s.startedAt ? fmtElapsedMs(now - s.startedAt) : s.elapsed}</span></div>
          </div>
        </div>
        {isOwned && (
          <div className="focus-side-group">
            <h3>Effort</h3>
            {!effortSupported ? (
              <div className="effort-note">not supported on {s.model}</div>
            ) : (
              <div className="model-segment" role="radiogroup" aria-label="Effort">
                {effortLevels.map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    role="radio"
                    aria-checked={s.effort === lvl}
                    disabled={!isActive}
                    className={s.effort === lvl ? "on" : ""}
                    onClick={() => void handleEffortChange(lvl)}
                  >{lvl}</button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="focus-side-group">
          <h3>Cost</h3>
          <div className="kv-list">
            <div className="kv"><span className="k">so far</span><span className="v">{fmtCost(s.cost)}</span></div>
            <div className="kv"><span className="k">tools used</span><span className="v">{s.toolsUsed}</span></div>
          </div>
        </div>
        <div className="focus-side-group">
          <h3>Todos · {s.todosDone} / {s.todos}</h3>
          <div className="todos">
            {(s.todoList ?? []).slice(0, 8).map((t, i) => (
              <div key={i} className={`todo ${t.status}`}>
                <span className="mark">{t.status === "done" ? "✓" : t.status === "active" ? "◐" : "○"}</span>
                <span className="label">{t.text}</span>
              </div>
            ))}
            {(s.todoList ?? []).length === 0 && <div className="todo"><span className="mark">○</span><span className="label">No todos yet.</span></div>}
          </div>
        </div>
      </aside>
    </div>
  );
}
