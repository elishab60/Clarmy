/* global React */
const { useState, useEffect, useRef, useMemo } = React;

// ============================================================
// Icons — tiny inline SVGs (sentence-case, no emoji)
// ============================================================
const Icon = ({ name, size = 12 }) => {
  const s = size;
  const stroke = { stroke: 'currentColor', strokeWidth: 1.4, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    sessions:  <><rect x="1.5" y="1.5" width="4" height="4" {...stroke}/><rect x="7.5" y="1.5" width="4" height="4" {...stroke}/><rect x="1.5" y="7.5" width="4" height="4" {...stroke}/><rect x="7.5" y="7.5" width="4" height="4" {...stroke}/></>,
    projects:  <><path d="M1.5 3.5h4l1 1h4.5v6.5h-9.5z" {...stroke}/></>,
    history:   <><circle cx="6.5" cy="6.5" r="5" {...stroke}/><path d="M6.5 3.5v3l2 1.5" {...stroke}/></>,
    skills:    <><path d="M6.5 1.5l2 2 2.5 .5-1.5 2 .5 2.5-2.5-.5-1 2-1-2-2.5.5.5-2.5-1.5-2 2.5-.5z" {...stroke}/></>,
    mcp:       <><rect x="2" y="2" width="9" height="9" {...stroke}/><path d="M2 5.5h9M5.5 2v9" {...stroke}/></>,
    plugins:   <><path d="M3 2v3H1.5v3h1.5v3h7v-3h1.5v-3h-1.5v-3" {...stroke}/></>,
    hooks:     <><path d="M3 2v5a3 3 0 0 0 6 0v-1" {...stroke}/></>,
    settings:  <><circle cx="6.5" cy="6.5" r="2" {...stroke}/><path d="M6.5 1v2M6.5 10v2M1 6.5h2M10 6.5h2M3 3l1.5 1.5M8.5 8.5L10 10M3 10l1.5-1.5M8.5 4.5L10 3" {...stroke}/></>,
  };
  return (
    <svg width={s} height={s} viewBox="0 0 13 13" className="ico" aria-hidden="true">
      {paths[name]}
    </svg>
  );
};

const STATE_META = {
  running:  { label: 'running',  color: 'var(--state-running)' },
  tool:     { label: 'tool use', color: 'var(--state-tool)' },
  approval: { label: 'approval', color: 'var(--state-approval)' },
  error:    { label: 'error',    color: 'var(--state-error)' },
  idle:     { label: 'idle',     color: 'var(--state-idle)' },
  done:     { label: 'done',     color: 'var(--state-done)' },
};

// ============================================================
// Sidebar
// ============================================================
function Sidebar({ activeNav, onNav, onNewSession }) {
  const nav1 = [
    { k: 'sessions',  label: 'Sessions',    badge: '6',   icon: 'sessions' },
    { k: 'projects',  label: 'Projects',    badge: '11',  icon: 'projects' },
    { k: 'history',   label: 'History',     badge: '284', icon: 'history' },
  ];
  const nav2 = [
    { k: 'skills',    label: 'Skills',      badge: '23', icon: 'skills' },
    { k: 'mcp',       label: 'MCP servers', badge: '8',  icon: 'mcp' },
    { k: 'plugins',   label: 'Plugins',     badge: '4',  icon: 'plugins' },
    { k: 'hooks',     label: 'Hooks',       badge: '6',  icon: 'hooks' },
    { k: 'settings',  label: 'Settings',    icon: 'settings' },
  ];
  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="wordmark"><span className="dot"/>Cockpit</div>
      </div>
      <button className="new-session" onClick={onNewSession}>
        <span className="plus">+</span> New session
        <span className="kbd">⌘N</span>
      </button>

      <div className="nav-group">
        <div className="nav-label">Navigation</div>
        {nav1.map(n => (
          <button key={n.k} className={`nav-item ${activeNav === n.k ? 'active' : ''}`} onClick={() => onNav(n.k)}>
            <Icon name={n.icon}/>{n.label}{n.badge && <span className="badge">{n.badge}</span>}
          </button>
        ))}
      </div>

      <div className="nav-group">
        <div className="nav-label">Config</div>
        {nav2.map(n => (
          <button key={n.k} className={`nav-item ${activeNav === n.k ? 'active' : ''}`} onClick={() => onNav(n.k)}>
            <Icon name={n.icon}/>{n.label}{n.badge && <span className="badge">{n.badge}</span>}
          </button>
        ))}
      </div>

      <div className="sidebar-alerts">
        <div className="nav-label" style={{padding: '4px 4px 6px'}}>Alerts</div>
        <div className="alert-row amber">
          <span>Pending approvals</span>
          <span className="v">1</span>
        </div>
        <div className="alert-row">
          <span>Tokens today</span>
          <span className="v">2.4M</span>
        </div>
        <div className="alert-row">
          <span>p95 duration</span>
          <span className="v">08:12</span>
        </div>
      </div>
    </aside>
  );
}

// ============================================================
// Topbar
// ============================================================
function Topbar({ view, onView, title, sessionCount, totalCost, theme, onToggleTheme, onOpenCmdk, tweaksOpen, onToggleTweaks }) {
  const views = [
    { k: 'dashboard',  label: 'Dashboard' },
    { k: 'focus',      label: 'Focus' },
    { k: 'mcp',        label: 'MCP' },
    { k: 'new',        label: 'New session' },
    { k: 'compare',    label: 'Theme A/B' },
  ];
  return (
    <header className="topbar">
      <div className="title">
        <strong>{title}</strong>
      </div>
      <div className="view-tabs">
        {views.map(v => (
          <button key={v.k} className={view === v.k ? 'active' : ''} onClick={() => onView(v.k)}>{v.label}</button>
        ))}
      </div>

      <div className="meta">
        <span><span className="k">sessions</span><span className="v">{sessionCount}</span></span>
        <span><span className="k">cost today</span><span className="v">${totalCost.toFixed(2)}</span></span>
        <button className="cmdk-trigger" onClick={onOpenCmdk}>
          <span>Search or run a command</span>
          <span className="kbd">⌘K</span>
        </button>
        <div className="theme-toggle" role="tablist">
          <button className={theme === 'dark' ? 'on' : ''} onClick={() => onToggleTheme('dark')}>dark</button>
          <button className={theme === 'light' ? 'on' : ''} onClick={() => onToggleTheme('light')}>light</button>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// Statusbar
// ============================================================
function Statusbar({ sessions }) {
  const counts = sessions.reduce((acc, s) => { acc[s.state] = (acc[s.state] || 0) + 1; return acc; }, {});
  const order = ['running','tool','approval','error','idle','done'];
  return (
    <footer className="statusbar">
      <div className="sb-group">
        {order.map(k => (
          <span key={k} className="sb-pill">
            <span className="sdot" style={{ background: STATE_META[k].color }}/>
            <span>{STATE_META[k].label} {counts[k] || 0}</span>
          </span>
        ))}
      </div>
      <div className="sb-sep"/>
      <span className="sb-pill"><span>claude-code v1.42.0</span></span>
      <span className="sb-sep"/>
      <span className="sb-pill"><span>orchestrator · port 9782</span></span>
      <div className="sb-right">
        <span>↑ 1.2kb/s · ↓ 4.8kb/s</span>
        <span className="sb-sep"/>
        <span className="ws-indicator"><span className="rdot"/>websocket · connected</span>
      </div>
    </footer>
  );
}

window.CockpitShell = { Sidebar, Topbar, Statusbar, Icon, STATE_META };
