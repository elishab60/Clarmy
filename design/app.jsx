/* global React, ReactDOM */
const { useState: useStateA, useEffect: useEffectA, useMemo: useMemoA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "density": "default",
  "cols": 3,
  "accent": "#d97757",
  "tileVariant": "card"
}/*EDITMODE-END*/;

// ============================================================
// Theme helpers
// ============================================================
function applyRoot(tweaks) {
  const root = document.documentElement;
  root.setAttribute('data-theme', tweaks.theme);
  root.setAttribute('data-density', tweaks.density);
  root.style.setProperty('--brand', tweaks.accent);
  // darken hover
  root.style.setProperty('--brand-hover', tweaks.accent);
}

// ============================================================
// Nested pane — renders a whole cockpit dashboard inside a div
// that scopes theme variables. Used by compare view.
// ============================================================
function NestedPane({ theme, label, sessions, cols }) {
  const { Dashboard } = window.CockpitTiles;
  const { STATE_META } = window.CockpitShell;
  // Count per state
  const counts = sessions.reduce((a, s) => { a[s.state] = (a[s.state] || 0) + 1; return a; }, {});
  const order = ['running','tool','approval','error','idle','done'];
  return (
    <div className="compare-pane" data-nested-theme={theme} data-theme={theme}>
      <div className="pane-label">
        <span>{label}</span>
        <span style={{marginLeft:'auto', color:'var(--fg-muted)'}}>6 tiles · {theme}</span>
      </div>
      <div className="pane-body">
        <Dashboard sessions={sessions} cols={cols} onOpen={()=>{}} onApprove={()=>{}} onDeny={()=>{}}/>
      </div>
      <div className="statusbar" style={{gridArea:'unset'}}>
        <div className="sb-group">
          {order.map(k => (
            <span key={k} className="sb-pill">
              <span className="sdot" style={{width:6,height:6,borderRadius:'50%',background: STATE_META[k].color}}/>
              <span>{STATE_META[k].label} {counts[k] || 0}</span>
            </span>
          ))}
        </div>
        <div className="sb-right">
          <span className="ws-indicator"><span className="rdot"/>connected</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// App
// ============================================================
function App() {
  const [tweaks, setTweaks] = useStateA(() => {
    try { return { ...TWEAK_DEFAULTS, ...(JSON.parse(localStorage.getItem('cockpit.tweaks') || '{}')) }; }
    catch { return TWEAK_DEFAULTS; }
  });
  const [tweaksOpen, setTweaksOpen] = useStateA(false);
  const [view, setView] = useStateA(() => localStorage.getItem('cockpit.view') || 'dashboard');
  const [activeNav, setActiveNav] = useStateA(() => localStorage.getItem('cockpit.nav') || 'sessions');
  const [cmdkOpen, setCmdkOpen] = useStateA(false);
  const [approvalFor, setApprovalFor] = useStateA(null);
  const [focusSession, setFocusSession] = useStateA(null);
  const [sessions, setSessions] = useStateA(window.SESSIONS);

  useEffectA(() => { applyRoot(tweaks); localStorage.setItem('cockpit.tweaks', JSON.stringify(tweaks)); }, [tweaks]);
  useEffectA(() => { localStorage.setItem('cockpit.view', view); }, [view]);
  useEffectA(() => { localStorage.setItem('cockpit.nav', activeNav); }, [activeNav]);

  // Global key shortcuts
  useEffectA(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdkOpen(v => !v); }
      else if (e.key === 'Escape') { setCmdkOpen(false); setApprovalFor(null); if (view === 'focus') setView('dashboard'); }
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); setView('new'); }
      else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleTheme(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view]);

  const toggleTheme = () => setTweaks(t => ({ ...t, theme: t.theme === 'dark' ? 'light' : 'dark' }));

  // Edit-mode protocol
  useEffectA(() => {
    const onMsg = (e) => {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setTweaksOpen(true);
      else if (d.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch {}
    return () => window.removeEventListener('message', onMsg);
  }, []);
  // Persist edits through host
  useEffectA(() => {
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: tweaks }, '*'); } catch {}
  }, [tweaks]);

  const openSessionFocus = (s) => { setFocusSession(s); setView('focus'); };
  const onApprove = (s) => setApprovalFor(s);
  const onDeny = (s) => { setSessions(ss => ss.map(x => x.id === s.id ? { ...x, state: 'idle', tool: null } : x)); };
  const applyApproval = (allow) => {
    if (!approvalFor) return;
    setSessions(ss => ss.map(x => x.id === approvalFor.id ? { ...x, state: allow ? 'running' : 'idle', tool: allow ? 'Bash' : null } : x));
    setApprovalFor(null);
  };

  const totalCost = sessions.reduce((a, s) => a + s.cost, 0);
  const { Sidebar, Topbar, Statusbar } = window.CockpitShell;
  const { Dashboard } = window.CockpitTiles;
  const { FocusView, McpPage, NewSessionView } = window.CockpitViews;
  const { CmdK, ApprovalModal, TweaksPanel } = window.CockpitOverlays;

  // View title for topbar
  const titleFor = {
    dashboard: 'Sessions · dashboard',
    focus: `${focusSession?.project || ''}/${focusSession?.name || 'session'}`,
    mcp: 'Config · MCP servers',
    new: 'Sessions · new',
    compare: 'Theme A/B',
  };

  return (
    <div className="app">
      <Sidebar
        activeNav={activeNav}
        onNav={(k) => {
          setActiveNav(k);
          if (k === 'mcp') setView('mcp');
          else if (k === 'sessions' || k === 'projects' || k === 'history') setView('dashboard');
          else setView('mcp'); // stub — skills/plugins/hooks show the same config chrome
        }}
        onNewSession={() => setView('new')}
      />
      <Topbar
        view={view}
        onView={setView}
        title={titleFor[view] || 'Cockpit'}
        sessionCount={sessions.length}
        totalCost={totalCost}
        theme={tweaks.theme}
        onToggleTheme={(t) => setTweaks(tw => ({ ...tw, theme: t }))}
        onOpenCmdk={() => setCmdkOpen(true)}
      />
      <main className="main">
        {view === 'dashboard' && (
          <Dashboard
            sessions={sessions}
            cols={tweaks.cols}
            onOpen={openSessionFocus}
            onApprove={onApprove}
            onDeny={onDeny}
          />
        )}
        {view === 'focus' && focusSession && (
          <FocusView session={focusSession} onClose={() => setView('dashboard')} />
        )}
        {view === 'mcp' && <McpPage/>}
        {view === 'new' && <NewSessionView onCancel={() => setView('dashboard')} onCreate={() => setView('dashboard')} />}
        {view === 'compare' && (
          <div className="compare-shell">
            <NestedPane theme="dark" label="Dark · default" sessions={sessions} cols={2}/>
            <NestedPane theme="light" label="Light · warm off-white" sessions={sessions} cols={2}/>
          </div>
        )}
      </main>
      <Statusbar sessions={sessions}/>

      {cmdkOpen && (
        <CmdK
          onClose={() => setCmdkOpen(false)}
          onNav={(v) => setView(v)}
          onOpenSession={openSessionFocus}
          onToggleTheme={toggleTheme}
        />
      )}

      {approvalFor && (
        <ApprovalModal
          session={approvalFor}
          onClose={() => setApprovalFor(null)}
          onAllow={() => applyApproval(true)}
          onDeny={() => applyApproval(false)}
        />
      )}

      <TweaksPanel open={tweaksOpen} onClose={() => setTweaksOpen(false)} tweaks={tweaks} setTweaks={setTweaks}/>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
