/* global React */
const { useState: useStateT, useEffect: useEffectT, useRef: useRefT } = React;

// ============================================================
// Streaming terminal (running state)
// ============================================================
function StreamTerm({ logs, liveLines = [] }) {
  const [tick, setTick] = useStateT(0);
  useEffectT(() => {
    const t = setInterval(() => setTick(x => x + 1), 1400);
    return () => clearInterval(t);
  }, []);

  // append a fake live line every tick
  const extras = [];
  const liveSet = [
    { t: 'muted', v: ' › evaluating middleware chain…' },
    { t: 'ok',    v: ' PASS  rate limiter integration (31ms)' },
    { t: 'muted', v: ' › hydrating fixture: user_admin' },
    { t: 'plain', v: ' RUNS  handles concurrent requests' },
    { t: 'ok',    v: ' PASS  propagates trace context (7ms)' },
    { t: 'muted', v: ' › resolving 14 assertions…' },
  ];
  const n = 2 + (tick % 3);
  for (let i = 0; i < n; i++) extras.push(liveSet[(tick + i) % liveSet.length]);
  const all = [...logs, ...extras];
  return (
    <div className="term-stream">
      {all.map((l, i) => (
        <span key={i} className={`ln ${l.t}`}>
          {l.t === 'gt' ? '› ' : ''}{l.v}
        </span>
      ))}
      <span className="cursor" />
    </div>
  );
}

// ============================================================
// Diff preview (tool state)
// ============================================================
function DiffView({ path, rows }) {
  return (
    <div className="diff">
      <div className="diff-header">
        <span className="chip">Edit</span>
        <span style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{path}</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} className={`row ${r.type}`}>
          <span className="ln">{r.ln}</span>
          <span className="txt">{r.txt}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Todos (idle)
// ============================================================
function Todos({ items }) {
  const mark = { done: '✓', active: '◐', todo: '○' };
  return (
    <div className="todos">
      {items.map((t, i) => (
        <div key={i} className={`todo ${t.status}`}>
          <span className="mark">{mark[t.status]}</span>
          <span className="label">{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Approval body
// ============================================================
function ApprovalBody({ tool, args, onAllow, onDeny }) {
  const preview = Object.entries(args).map(([k, v]) => (
    <div key={k}><span className="arg-k">{k}</span>: <span className="arg-s">{JSON.stringify(v)}</span></div>
  ));
  return (
    <div className="approval-preview">
      <div className="tool-name">{tool} · awaiting approval</div>
      <pre>{preview}</pre>
      <div className="approval-actions">
        <button className="allow" onClick={onAllow}>Allow</button>
        <button className="deny" onClick={onDeny}>Deny</button>
      </div>
    </div>
  );
}

// ============================================================
// Error body
// ============================================================
function ErrorBody({ msg, retryIn }) {
  return (
    <div className="err-body">
      <div className="err-msg">{msg}</div>
      <div className="err-retry">
        <span>auto-retry</span>
        <span className="bar"><span/></span>
        <span>{retryIn}s</span>
      </div>
    </div>
  );
}

// ============================================================
// Done body
// ============================================================
function DoneBody({ summary, artifacts }) {
  return (
    <div className="done-body">
      <div className="done-summary">{summary}</div>
      <div className="done-artifacts">
        {artifacts.map((a, i) => <span key={i} className="art">{a}</span>)}
      </div>
    </div>
  );
}

// ============================================================
// Tile — compact card
// ============================================================
function Tile({ s, onOpen, onApprove, onDeny }) {
  const meta = window.CockpitShell.STATE_META[s.state];
  const elapsedRef = useRefT({ base: s.elapsed, tick: 0 });
  const [, force] = useStateT(0);
  useEffectT(() => {
    if (s.state !== 'running' && s.state !== 'tool' && s.state !== 'approval') return;
    const t = setInterval(() => { elapsedRef.current.tick++; force(x => x + 1); }, 1000);
    return () => clearInterval(t);
  }, [s.state]);

  // tick the elapsed display upward for live sessions
  let elapsed = s.elapsed;
  if ((s.state === 'running' || s.state === 'tool') && /^\d\d:\d\d$/.test(s.elapsed)) {
    const [m, sec] = s.elapsed.split(':').map(Number);
    const total = m * 60 + sec + elapsedRef.current.tick;
    elapsed = `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  }

  return (
    <div
      className={`tile s-${s.state}`}
      style={{ '--state-color': meta.color }}
      onClick={onOpen}
    >
      <div className="tile-head">
        <span className="sdot"/>
        <div className="tile-title">
          <span className="path">{s.project}/</span>{s.name}
        </div>
        <span className="tile-model">{s.model}</span>
        <button className="tile-kebab" onClick={e => e.stopPropagation()}>⋯</button>
      </div>

      <div className="tile-status">
        <span className="state">{meta.label}</span>
        {s.tool && <><span className="dot-sep">·</span><span className="tool">{s.tool}</span></>}
        <span className="elapsed">{elapsed}</span>
      </div>

      <div className="tile-body">
        {s.state === 'running' && <StreamTerm logs={s.logs} />}
        {s.state === 'tool' && <DiffView path={s.editPath} rows={s.diff} />}
        {s.state === 'approval' && (
          <ApprovalBody
            tool={s.approvalTool}
            args={s.approvalArgs}
            onAllow={(e) => { e.stopPropagation(); onApprove && onApprove(s); }}
            onDeny={(e) => { e.stopPropagation(); onDeny && onDeny(s); }}
          />
        )}
        {s.state === 'error' && <ErrorBody msg={s.error} retryIn={s.retryIn} />}
        {s.state === 'idle' && <Todos items={s.todoList} />}
        {s.state === 'done' && <DoneBody summary={s.summary} artifacts={s.artifacts} />}
      </div>

      <div className="tile-foot">
        <span>⟳ {s.toolsUsed} tools</span>
        <span>✓ {s.todosDone}/{s.todos} todos</span>
        <span className="cost">${s.cost.toFixed(2)}</span>
      </div>
    </div>
  );
}

// ============================================================
// Dashboard grid
// ============================================================
function Dashboard({ sessions, cols, onOpen, onApprove, onDeny }) {
  return (
    <div className="grid" style={{ '--cols': cols }}>
      {sessions.map(s => (
        <Tile key={s.id} s={s} onOpen={() => onOpen(s)} onApprove={onApprove} onDeny={onDeny} />
      ))}
    </div>
  );
}

window.CockpitTiles = { Tile, Dashboard };
