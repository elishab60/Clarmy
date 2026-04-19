/* global React */
const { useState: useStateV, useEffect: useEffectV, useMemo: useMemoV, useRef: useRefV } = React;

// ============================================================
// Focus / expanded view
// ============================================================
function FocusView({ session, onClose }) {
  const s = session;
  const meta = window.CockpitShell.STATE_META[s.state];
  const bars = window.COST_BARS;
  const max = Math.max(...bars);

  // tool timeline segments (percent widths)
  const segments = [
    { label: 'Read',   pct: 18, color: 'var(--fg-faint)' },
    { label: 'Bash',   pct: 26, color: 'var(--state-running)' },
    { label: 'Edit',   pct: 22, color: 'var(--state-tool)' },
    { label: 'Read',   pct: 8,  color: 'var(--fg-faint)' },
    { label: 'Bash',   pct: 14, color: 'var(--state-running)' },
    { label: 'Approval', pct: 4, color: 'var(--state-approval)' },
    { label: 'Edit',   pct: 8,  color: 'var(--state-tool)' },
  ];

  return (
    <div className="focus-shell">
      <section className="focus-main">
        <div className="focus-header">
          <span className="sdot" style={{ background: meta.color }}/>
          <span className="path">{s.project}/</span>
          <h2>{s.name}</h2>
          <div className="actions">
            <button>Pause</button>
            <button>Fork</button>
            <button>Open in terminal</button>
            <button className="close" onClick={onClose}>esc ✕</button>
          </div>
        </div>

        <div className="focus-body">
          <div className="focus-term">
            <div className="head">› refactor auth middleware</div>
            <div className="muted">session s_47a2 · started 14:22:03 · model opus-4.7</div>
            <br/>
            <div><span className="gt">›</span> reading <span>src/middleware/auth.ts</span> <span className="muted">(182 lines)</span></div>
            <div><span className="gt">›</span> reading <span>src/middleware/auth.spec.ts</span> <span className="muted">(94 lines)</span></div>
            <div><span className="gt">›</span> running <span className="warn">Bash</span>: <span className="muted">pnpm test auth.spec.ts</span></div>
            <br/>
            <div className="muted"> RUN  src/middleware/auth.spec.ts</div>
            <div className="ok"> PASS  validates bearer tokens (18ms)</div>
            <div className="ok"> PASS  rejects expired jwt (4ms)</div>
            <div className="ok"> PASS  refresh token rotation (22ms)</div>
            <div className="ok"> PASS  rate limiter integration (31ms)</div>
            <div className="ok"> PASS  propagates trace context (7ms)</div>
            <div className="muted"> RUNS  handles concurrent requests</div>
            <div><span className="muted"> › evaluating middleware chain…</span></div>
            <div><span className="muted"> › hydrating fixture: user_admin</span></div>
            <div><span className="muted"> › resolving 14 assertions…</span><span className="cursor"/></div>
          </div>

          <div className="focus-timeline">
            <div className="tl-title">Tool timeline · last 2:14</div>
            <div className="tl-bar">
              {segments.map((seg, i) => (
                <span key={i} title={`${seg.label} — ${seg.pct}%`} style={{ width: `${seg.pct}%`, background: seg.color }}/>
              ))}
            </div>
            <div className="tl-legend">
              <span><span className="sw" style={{background:'var(--state-running)'}}/>Bash</span>
              <span><span className="sw" style={{background:'var(--state-tool)'}}/>Edit</span>
              <span><span className="sw" style={{background:'var(--fg-faint)'}}/>Read</span>
              <span><span className="sw" style={{background:'var(--state-approval)'}}/>Approval</span>
            </div>
          </div>
        </div>
      </section>

      <aside className="focus-side">
        <div className="focus-side-group">
          <h3>Session</h3>
          <div className="kv-list">
            <div className="kv"><span className="k">id</span><span className="v">{s.id}</span></div>
            <div className="kv"><span className="k">model</span><span className="v">{s.model}</span></div>
            <div className="kv"><span className="k">branch</span><span className="v">feat/auth-refactor</span></div>
            <div className="kv"><span className="k">started</span><span className="v">14:22:03</span></div>
            <div className="kv"><span className="k">elapsed</span><span className="v">{s.elapsed}</span></div>
            <div className="kv"><span className="k">tokens</span><span className="v">412k / 200k ctx</span></div>
          </div>
        </div>

        <div className="focus-side-group">
          <h3>Cost · last 24m</h3>
          <div className="cost-chart">
            {bars.map((v, i) => (
              <span key={i} className={`bar ${v === max ? 'hi' : ''}`} style={{ height: `${(v / max) * 100}%` }}/>
            ))}
          </div>
          <div className="kv-list">
            <div className="kv"><span className="k">so far</span><span className="v">${s.cost.toFixed(2)}</span></div>
            <div className="kv"><span className="k">rate</span><span className="v">$0.19 / min</span></div>
            <div className="kv"><span className="k">est. total</span><span className="v">$0.68</span></div>
          </div>
        </div>

        <div className="focus-side-group">
          <h3>Todos · 2 / 5</h3>
          <div className="todos">
            <div className="todo done"><span className="mark">✓</span><span className="label">audit current middleware</span></div>
            <div className="todo done"><span className="mark">✓</span><span className="label">extract token verifier</span></div>
            <div className="todo active"><span className="mark">◐</span><span className="label">add refresh rotation</span></div>
            <div className="todo"><span className="mark">○</span><span className="label">migrate callers to v2</span></div>
            <div className="todo"><span className="mark">○</span><span className="label">write migration notes</span></div>
          </div>
        </div>
      </aside>
    </div>
  );
}

// ============================================================
// MCP config page
// ============================================================
function McpPage() {
  const servers = window.MCP_SERVERS;
  const [activeId, setActiveId] = useStateV(servers.find(s => s.active)?.id || servers[0].id);
  const [query, setQuery] = useStateV('');
  const [enabled, setEnabled] = useStateV(true);
  const filtered = servers.filter(s => s.name.includes(query.toLowerCase()) || s.desc.toLowerCase().includes(query.toLowerCase()));
  const active = servers.find(s => s.id === activeId);

  const tools = [
    { name: 'create_issue',     desc: 'Open a new issue in a repo',     calls: 42, perm: 'auto' },
    { name: 'list_issues',      desc: 'Query issues by filters',        calls: 118, perm: 'auto' },
    { name: 'comment_on_issue', desc: 'Add a comment to an issue',      calls: 27, perm: 'auto' },
    { name: 'create_pr',        desc: 'Open a pull request',            calls: 9,  perm: 'ask' },
    { name: 'merge_pr',         desc: 'Merge an approved pull request', calls: 3,  perm: 'ask' },
    { name: 'close_issue',      desc: 'Close an issue as resolved',     calls: 14, perm: 'auto' },
  ];

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>MCP servers</h1>
          <p className="sub">Configure Model Context Protocol servers available to your sessions. Servers expose tools that Claude can call on your behalf.</p>
        </div>
        <div className="right">
          <button className="btn">Import config</button>
          <button className="btn primary">Add server</button>
        </div>
      </div>

      <div className="mcp-grid">
        <div className="mcp-list">
          <input className="search" placeholder="Filter servers…" value={query} onChange={e => setQuery(e.target.value)}/>
          {filtered.map(s => (
            <button key={s.id} className={`mcp-item ${s.id === activeId ? 'active' : ''}`} onClick={() => setActiveId(s.id)}>
              <span className={`mcp-dot ${s.status}`}/>
              <div className="meta">
                <span className="name">{s.name}</span>
                <span className="desc">{s.desc}</span>
              </div>
              <span className="tool-count">{s.tools}</span>
            </button>
          ))}
        </div>

        <div className="mcp-detail">
          <div className="row-h">
            <h2>{active.name}</h2>
            <span className="id">mcp-{active.id}-{active.id === 'gh' ? 'v0.4.1' : 'v0.2.0'}</span>
            {active.status === 'on' && <span className="status-pill">connected</span>}
            {active.status === 'err' && <span className="status-pill" style={{color:'var(--state-error)', background:'rgba(239,68,68,0.08)', boxShadow:'inset 0 0 0 1px rgba(239,68,68,0.2)'}}>auth error</span>}
            {active.status === 'off' && <span className="status-pill" style={{color:'var(--fg-muted)', background:'rgba(255,255,255,0.04)', boxShadow:'inset 0 0 0 1px var(--border)'}}>disabled</span>}
            <div className="right-actions">
              <button className="btn">Restart</button>
              <button className="btn">View logs</button>
            </div>
          </div>

          <div className="field-grid">
            <div className="k">Enabled</div>
            <div className="v">
              <button className={`toggle ${enabled ? 'on' : ''}`} onClick={() => setEnabled(e => !e)}>
                <span className="sw"/>
                <span>{enabled ? 'on' : 'off'}</span>
              </button>
            </div>

            <div className="k">Command</div>
            <div className="v">
              <input defaultValue={`npx @modelcontextprotocol/server-${active.name}`} />
              <div className="hint">Launched in the session's working directory.</div>
            </div>

            <div className="k">Transport</div>
            <div className="v">
              <select defaultValue="stdio">
                <option>stdio</option>
                <option>sse</option>
                <option>websocket</option>
              </select>
            </div>

            <div className="k">Env</div>
            <div className="v">
              <input defaultValue={active.name === 'github' ? 'GITHUB_TOKEN=••••••••••••••cKp2' : 'API_KEY=••••••••••'} />
              <div className="hint">Loaded from ~/.config/cockpit/secrets.toml</div>
            </div>

            <div className="k">Timeout</div>
            <div className="v">
              <input defaultValue="30s" style={{maxWidth:'120px'}}/>
            </div>

            <div className="k">Allow-list scope</div>
            <div className="v">
              <input defaultValue="org:acme-inc, repo:acme-inc/*" />
              <div className="hint">Comma-separated. Leave blank to allow all.</div>
            </div>
          </div>

          <h3 style={{margin:'0 0 10px', fontSize:'9.5px', letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--fg-faint)', fontFamily:'var(--font-mono)', fontWeight:500}}>Tools · {tools.length}</h3>
          <div className="tools-table">
            <div className="trow head">
              <span>name</span><span>description</span><span style={{textAlign:'right'}}>calls</span><span style={{textAlign:'right'}}>perm</span>
            </div>
            {tools.map(t => (
              <div key={t.name} className="trow">
                <span className="tname">{t.name}</span>
                <span className="tdesc">{t.desc}</span>
                <span className="ncalls">{t.calls}</span>
                <span className={`tperm ${t.perm}`}>{t.perm}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// New session (empty state form)
// ============================================================
function NewSessionView({ onCancel, onCreate }) {
  const [model, setModel] = useStateV('opus-4.7');
  const ALL_TOOLS = ['Bash','Read','Edit','Write','Grep','Glob','WebFetch','WebSearch','TodoWrite','Task'];
  const [tools, setTools] = useStateV(['Bash','Read','Edit','Write','Grep','TodoWrite']);
  const toggleTool = (t) => setTools(ts => ts.includes(t) ? ts.filter(x => x !== t) : [...ts, t]);

  return (
    <div className="new-session-view">
      <h1>New session</h1>
      <p className="lede">Spawn a Claude Code session in a project directory. You can approve tool calls individually or let a set of them run unattended.</p>

      <div className="form-card">
        <div className="form-section">
          <h4>Workspace</h4>
          <div className="form-row">
            <label>Project dir</label>
            <div className="ctrl">
              <input defaultValue="~/code/acme-api" placeholder="~/code/…"/>
            </div>
          </div>
          <div className="form-row">
            <label>Branch</label>
            <div className="ctrl">
              <input defaultValue="main" placeholder="main"/>
            </div>
          </div>
          <div className="form-row">
            <label>Session name</label>
            <div className="ctrl">
              <input placeholder="refactor auth middleware"/>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Model</h4>
          <div className="form-row">
            <label>Model</label>
            <div className="ctrl">
              <div className="model-picker">
                {['opus-4.7','sonnet-4.6','haiku-4.5'].map(m => (
                  <button key={m} className={model === m ? 'on' : ''} onClick={() => setModel(m)}>{m}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="form-row">
            <label>Context</label>
            <div className="ctrl">
              <select defaultValue="200k">
                <option>200k</option><option>500k</option><option>1M</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Allowed tools</h4>
          <div className="form-row">
            <label>Built-in</label>
            <div className="ctrl">
              <div className="tool-chips">
                {ALL_TOOLS.map(t => (
                  <button key={t} className={`chip ${tools.includes(t) ? 'on' : ''}`} onClick={() => toggleTool(t)}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="form-row">
            <label>MCP servers</label>
            <div className="ctrl">
              <div className="tool-chips">
                {window.MCP_SERVERS.filter(s => s.status === 'on').map(s => (
                  <span key={s.id} className="chip on">{s.name}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="form-row">
            <label>Approval</label>
            <div className="ctrl">
              <select defaultValue="prompt">
                <option value="auto">auto — run all tools without asking</option>
                <option value="prompt">prompt — ask before destructive tools</option>
                <option value="strict">strict — ask for every tool call</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Initial prompt</h4>
          <div className="form-row">
            <label>Prompt</label>
            <div className="ctrl">
              <textarea placeholder="Describe the task. The agent will read the repo, plan with todos, and begin work."
                defaultValue="Refactor the auth middleware to support refresh-token rotation. Keep the public API backwards-compatible and update tests."/>
            </div>
          </div>
        </div>

        <div className="form-foot">
          <span className="hint">⌘↵ to launch · esc to cancel</span>
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={onCreate}>Launch session</button>
        </div>
      </div>
    </div>
  );
}

window.CockpitViews = { FocusView, McpPage, NewSessionView };
