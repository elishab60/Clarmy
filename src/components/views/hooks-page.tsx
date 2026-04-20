"use client";

import { useState } from "react";

type HookEvent =
  | "SessionStart"
  | "UserPromptSubmit"
  | "PreToolUse"
  | "PostToolUse"
  | "Stop"
  | "SubagentStop";

interface HookRow {
  readonly id: string;
  readonly event: HookEvent;
  readonly matcher: string;
  readonly command: string;
  readonly enabled: boolean;
  readonly runs: number;
  readonly lastRun: string;
  readonly avgMs: number;
}

const HOOKS: HookRow[] = [
  { id: "h-session-ctx",   event: "SessionStart",     matcher: "*",                 command: "scripts/inject-session-context.sh", enabled: true,  runs: 214, lastRun: "2m ago", avgMs: 42  },
  { id: "h-prompt-lint",   event: "UserPromptSubmit", matcher: "*",                 command: "scripts/prompt-lint.mjs",           enabled: true,  runs: 1024, lastRun: "8s ago", avgMs: 9   },
  { id: "h-bash-allow",    event: "PreToolUse",       matcher: "Bash",              command: "scripts/bash-allowlist.sh",         enabled: true,  runs: 412, lastRun: "1m ago", avgMs: 12  },
  { id: "h-bash-audit",    event: "PostToolUse",      matcher: "Bash",              command: "scripts/log-bash.sh >> .cockpit/bash.log", enabled: true, runs: 412, lastRun: "1m ago", avgMs: 6 },
  { id: "h-edit-typecheck",event: "PostToolUse",      matcher: "Edit|Write",        command: "pnpm typecheck --incremental",      enabled: true,  runs: 87,  lastRun: "12m ago", avgMs: 2840 },
  { id: "h-stop-notify",   event: "Stop",             matcher: "*",                 command: "osascript -e 'display notification'", enabled: false, runs: 0,   lastRun: "never", avgMs: 0   },
];

const EVENT_META: Record<HookEvent, { color: string; desc: string }> = {
  SessionStart:     { color: "var(--brand)",        desc: "Fires once when a session boots — inject context." },
  UserPromptSubmit: { color: "var(--state-running)",desc: "Fires on every user message before Claude sees it." },
  PreToolUse:       { color: "var(--state-tool)",   desc: "Fires before a tool call; can block or rewrite args." },
  PostToolUse:      { color: "var(--state-done)",   desc: "Fires after a tool call; runs type checks, audits." },
  Stop:             { color: "var(--fg-dim)",       desc: "Fires when the session ends (done or error)." },
  SubagentStop:     { color: "var(--fg-dim)",       desc: "Fires when a subagent completes its task." },
};

const RUN_COLS = "minmax(140px, 1fr) 70px 90px 110px";

export function HooksPage() {
  const [selectedId, setSelectedId] = useState<string>(HOOKS[0]!.id);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(
    () => Object.fromEntries(HOOKS.map((h) => [h.id, h.enabled])),
  );

  const active = HOOKS.find((h) => h.id === selectedId) ?? HOOKS[0]!;
  const isEnabled = enabledMap[active.id] ?? false;

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>Hooks</h1>
          <p className="sub">Shell commands that run on session lifecycle events. Hooks can inject context, audit tool calls, or block destructive operations.</p>
        </div>
        <div className="right">
          <button className="btn">View settings.json</button>
          <button className="btn primary">New hook</button>
        </div>
      </div>

      <div className="mcp-grid" style={{ gridTemplateColumns: "300px 1fr" }}>
        <div className="mcp-list">
          {HOOKS.map((h) => {
            const on = enabledMap[h.id] ?? false;
            return (
              <button key={h.id} className={`mcp-item ${h.id === active.id ? "active" : ""}`} onClick={() => setSelectedId(h.id)}>
                <span className={`mcp-dot ${on ? "on" : "off"}`} />
                <div className="meta">
                  <span className="name">{h.event}</span>
                  <span className="desc">{h.matcher === "*" ? "all tools" : h.matcher}</span>
                </div>
                <span className="tool-count">{h.runs}</span>
              </button>
            );
          })}
        </div>

        <div className="mcp-detail">
          <div className="row-h">
            <h2>
              <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: EVENT_META[active.event].color, marginRight: 10, verticalAlign: "middle" }} />
              {active.event}
            </h2>
            <span className="id">{active.matcher === "*" ? "matcher · all" : `matcher · ${active.matcher}`}</span>
            <span className="status-pill" style={!isEnabled ? { color: "var(--fg-muted)", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px var(--border)" } : undefined}>
              {isEnabled ? "enabled" : "disabled"}
            </span>
            <div className="right-actions">
              <button className="btn">Dry run</button>
              <button className="btn">View last output</button>
            </div>
          </div>

          <p style={{ margin: "0 0 18px", color: "var(--fg-dim)", fontSize: 13 }}>{EVENT_META[active.event].desc}</p>

          <div className="field-grid">
            <div className="k">Enabled</div>
            <div className="v">
              <button
                className={`toggle ${isEnabled ? "on" : ""}`}
                onClick={() => setEnabledMap((m) => ({ ...m, [active.id]: !isEnabled }))}
              >
                <span className="sw" />
                <span>{isEnabled ? "on" : "off"}</span>
              </button>
            </div>
            <div className="k">Matcher</div>
            <div className="v">
              <input defaultValue={active.matcher} />
              <div className="hint">Regex match against tool name. Use <code>*</code> to match all.</div>
            </div>
            <div className="k">Command</div>
            <div className="v">
              <input defaultValue={active.command} style={{ fontFamily: "var(--font-mono)" }} />
              <div className="hint">Run in the session&apos;s working directory. Exit non-zero to abort a PreToolUse.</div>
            </div>
            <div className="k">Timeout</div>
            <div className="v"><input defaultValue="5s" style={{ maxWidth: 120 }} /></div>
            <div className="k">Block on failure</div>
            <div className="v">
              <select defaultValue={active.event === "PreToolUse" ? "block" : "warn"}>
                <option value="block">block</option>
                <option value="warn">warn only</option>
                <option value="silent">silent</option>
              </select>
            </div>
          </div>

          <h3 style={{ margin: "0 0 10px", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-faint)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
            Runs · last 7 days
          </h3>
          <div className="table-scroll">
            <div className="tools-table runs-table" style={{ minWidth: 520 }}>
              <div className="trow head" style={{ gridTemplateColumns: RUN_COLS }}>
                <span>session</span>
                <span>exit</span>
                <span style={{ textAlign: "right" }}>ms</span>
                <span style={{ textAlign: "right" }}>when</span>
              </div>
              <div className="trow" style={{ gridTemplateColumns: RUN_COLS }}>
                <span className="tname">sess-9a12</span>
                <span className="tdesc">0</span>
                <span className="ncalls">{active.avgMs}</span>
                <span className="ncalls">{active.lastRun}</span>
              </div>
              <div className="trow" style={{ gridTemplateColumns: RUN_COLS }}>
                <span className="tname">sess-9a08</span>
                <span className="tdesc">0</span>
                <span className="ncalls">{Math.floor(active.avgMs * 0.9)}</span>
                <span className="ncalls">18m ago</span>
              </div>
              <div className="trow" style={{ gridTemplateColumns: RUN_COLS }}>
                <span className="tname">sess-9a04</span>
                <span className="tdesc" style={{ color: "var(--state-error)" }}>1</span>
                <span className="ncalls">{Math.floor(active.avgMs * 1.8)}</span>
                <span className="ncalls">1h ago</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
