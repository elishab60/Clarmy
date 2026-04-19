"use client";

import { useRouter } from "next/navigation";
import { useCockpit } from "@/lib/client/store";
import { STATE_META } from "../shell/state-meta";
import { PtyTerminal } from "../terminal/pty-terminal";

export function FocusView({ id }: { id: string }) {
  const router = useRouter();
  const s = useCockpit((st) => st.sessions[id]);

  if (!s) {
    return (
      <div style={{ padding: 40, color: "var(--fg-muted)" }}>
        Session <strong>{id}</strong> not found. <button className="btn ghost" onClick={() => router.push("/")}>Back to dashboard</button>
      </div>
    );
  }

  const meta = STATE_META[s.state];

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
            <button className="close" onClick={() => router.push("/")}>esc ✕</button>
          </div>
        </div>
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
            <div className="kv"><span className="k">model</span><span className="v">{s.model}</span></div>
            <div className="kv"><span className="k">state</span><span className="v" style={{ color: meta.color }}>{meta.label}</span></div>
            <div className="kv"><span className="k">tool</span><span className="v">{s.tool ?? "—"}</span></div>
            <div className="kv"><span className="k">elapsed</span><span className="v">{s.elapsed}</span></div>
          </div>
        </div>
        <div className="focus-side-group">
          <h3>Cost</h3>
          <div className="kv-list">
            <div className="kv"><span className="k">so far</span><span className="v">${s.cost.toFixed(2)}</span></div>
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
