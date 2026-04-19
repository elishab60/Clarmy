/* global React */
const { useState: useStateO, useEffect: useEffectO, useMemo: useMemoO, useRef: useRefO } = React;

// ============================================================
// Command palette
// ============================================================
function CmdK({ onClose, onNav, onOpenSession, onToggleTheme }) {
  const [q, setQ] = useStateO('');
  const [idx, setIdx] = useStateO(0);
  const inputRef = useRefO(null);

  useEffectO(() => { inputRef.current && inputRef.current.focus(); }, []);

  const items = window.CMDK_ITEMS;
  const filtered = useMemoO(() => {
    if (!q) return items;
    const ql = q.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(ql) || (i.sub || '').toLowerCase().includes(ql) || i.group.toLowerCase().includes(ql));
  }, [q]);

  // group filtered
  const grouped = useMemoO(() => {
    const g = {};
    filtered.forEach(i => { (g[i.group] = g[i.group] || []).push(i); });
    return g;
  }, [filtered]);

  // flat index list for keyboard nav
  const flat = useMemoO(() => {
    const out = [];
    Object.keys(grouped).forEach(grp => grouped[grp].forEach(i => out.push(i)));
    return out;
  }, [grouped]);

  useEffectO(() => { setIdx(0); }, [q]);

  const runItem = (it) => {
    if (!it) return;
    if (it.group === 'Sessions') {
      const sid = it.sub;
      const s = window.SESSIONS.find(x => x.id === sid);
      if (s) { onOpenSession(s); onClose(); return; }
    }
    if (it.group === 'Theme' && it.name.includes('dark / light')) { onToggleTheme(); onClose(); return; }
    if (it.group === 'Navigate') {
      const map = { 'Sessions':'dashboard', 'Projects':'dashboard', 'History':'dashboard', 'MCP servers':'mcp' };
      const v = map[it.name];
      if (v) { onNav(v); onClose(); return; }
    }
    onClose();
  };

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); runItem(flat[idx]); }
    else if (e.key === 'Escape') { e.preventDefault(); onClose(); }
  };

  let flatCounter = -1;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="cmdk" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdk-input"
          placeholder="Search sessions, run a command…"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={onKey}
        />
        <div className="cmdk-list">
          {Object.keys(grouped).length === 0 && <div className="cmdk-empty">No matches</div>}
          {Object.keys(grouped).map(grp => (
            <div key={grp}>
              <div className="cmdk-group-label">{grp}</div>
              {grouped[grp].map(it => {
                flatCounter++;
                const active = flatCounter === idx;
                const dotColor = it.state ? window.CockpitShell.STATE_META[it.state].color : null;
                return (
                  <div key={it.name} className={`cmdk-row ${active ? 'active' : ''}`} onClick={() => runItem(it)} onMouseEnter={() => setIdx(flatCounter)}>
                    {dotColor ? <span className="sdot" style={{background: dotColor}}/> : <span className="ico">{it.ico || '›'}</span>}
                    <span className="name">{it.name}</span>
                    {it.sub && <span className="sub">{it.sub}</span>}
                    <span className="arrow">{it.arrow || '↵'}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="cmdk-foot">
          <span><span className="kbd">↑↓</span>navigate</span>
          <span><span className="kbd">↵</span>run</span>
          <span><span className="kbd">esc</span>close</span>
          <span style={{marginLeft:'auto'}}>{flat.length} results</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Approval modal (tool-call review)
// ============================================================
function ApprovalModal({ session, onClose, onAllow, onDeny }) {
  const s = session;
  if (!s) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="sdot"/>
          <h3>Approve tool call</h3>
          <span className="sub">{s.project}/ · {s.id}</span>
        </div>
        <div className="modal-body">
          <div className="tool-label">{s.approvalTool}</div>
          <pre className="cmd">
{`{
  `}<span className="key">"command"</span>: <span className="str">"{s.approvalArgs.command}"</span>,{`
  `}<span className="key">"cwd"</span>: <span className="str">"{s.approvalArgs.cwd}"</span>,{`
  `}<span className="key">"timeout"</span>: <span className="num">{s.approvalArgs.timeout}</span>{`
}`}
          </pre>
          <div className="context-row"><span>Session</span><span className="v">{s.name}</span></div>
          <div className="context-row"><span>Model</span><span className="v">{s.model}</span></div>
          <div className="context-row"><span>Branch</span><span className="v">feat/dark-mode</span></div>
          <div className="context-row"><span>Touched by this session</span><span className="v">3 files · 7 tools</span></div>
          <div className="context-row"><span>Destructive</span><span className="v" style={{color:'var(--state-error)'}}>yes — removes node_modules</span></div>
        </div>
        <div className="modal-foot">
          <label className="opt"><input type="checkbox"/>Remember for this session</label>
          <button className="btn deny" onClick={onDeny}>Deny</button>
          <button className="btn allow" onClick={onAllow}>Allow once</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Tweaks panel
// ============================================================
function TweaksPanel({ open, onClose, tweaks, setTweaks }) {
  if (!open) return null;
  const set = (k, v) => setTweaks(t => ({ ...t, [k]: v }));

  return (
    <div className="tweaks-panel open">
      <h4><span>Tweaks</span><button onClick={onClose} style={{color:'var(--fg-muted)', fontFamily:'var(--font-mono)'}}>✕</button></h4>

      <div className="tw-row">
        <div className="lbl">Theme</div>
        <div className="seg">
          {['dark','light'].map(v => (
            <button key={v} className={tweaks.theme === v ? 'on' : ''} onClick={() => set('theme', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tw-row">
        <div className="lbl">Density</div>
        <div className="seg">
          {['compact','default','cozy'].map(v => (
            <button key={v} className={tweaks.density === v ? 'on' : ''} onClick={() => set('density', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tw-row">
        <div className="lbl">Grid columns</div>
        <div className="seg">
          {[2,3,4].map(v => (
            <button key={v} className={tweaks.cols === v ? 'on' : ''} onClick={() => set('cols', v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tw-row">
        <div className="lbl">Accent</div>
        <div className="accents">
          {[
            { k:'#d97757', n:'orange' },
            { k:'#4a9eff', n:'blue' },
            { k:'#a78bfa', n:'purple' },
            { k:'#22c55e', n:'green' },
            { k:'#e5e5e5', n:'mono' },
          ].map(a => (
            <button key={a.k} className={tweaks.accent === a.k ? 'on' : ''} style={{background:a.k}} onClick={() => set('accent', a.k)} title={a.n}/>
          ))}
        </div>
      </div>

      <div className="tw-row">
        <div className="lbl">Tile variant</div>
        <div className="seg">
          {['card','strip'].map(v => (
            <button key={v} className={tweaks.tileVariant === v ? 'on' : ''} onClick={() => set('tileVariant', v)}>{v}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

window.CockpitOverlays = { CmdK, ApprovalModal, TweaksPanel };
