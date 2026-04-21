"use client";

import { useEffect, useRef, useState } from "react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

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
  const [refreshing, setRefreshing] = useState(false);
  const [flashKey, setFlashKey] = useState(0);

  const refresh = () => {
    setRefreshing(true);
    setFlashKey((k) => k + 1);
    window.setTimeout(() => setRefreshing(false), 700);
  };

  const active = HOOKS.find((h) => h.id === selectedId) ?? HOOKS[0]!;
  const isEnabled = enabledMap[active.id] ?? false;

  const totalHooks = HOOKS.length;
  const enabledCount = HOOKS.reduce((acc, h) => acc + (enabledMap[h.id] ? 1 : 0), 0);
  const runsToday = HOOKS.reduce((acc, h) => acc + (enabledMap[h.id] ? h.runs : 0), 0);
  const activeAvg = (() => {
    const on = HOOKS.filter((h) => enabledMap[h.id] && h.avgMs > 0);
    if (on.length === 0) return 0;
    return Math.round(on.reduce((a, h) => a + h.avgMs, 0) / on.length);
  })();

  const maxRuns = Math.max(1, ...HOOKS.map((h) => h.runs));
  const maxAvgMs = Math.max(1, ...HOOKS.map((h) => h.avgMs));

  return (
    <div className="cfg-shell metrics-shell">
      <div className="cfg-header">
        <div>
          <h1>Hooks</h1>
          <p className="sub">Shell commands that run on session lifecycle events. Hooks can inject context, audit tool calls, or block destructive operations.</p>
        </div>
        <div className="right">
          <button
            className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`}
            onClick={refresh}
            aria-label="Refresh hooks"
          >
            <RefreshIcon />
            <span>Refresh</span>
          </button>
          <button className="btn">View settings.json</button>
          <button className="btn primary">New hook</button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard flashKey={flashKey} label="Configured hooks" value={totalHooks} format={fmtInt} foot={`${enabledCount} enabled · ${totalHooks - enabledCount} off`} accent />
        <StatCard flashKey={flashKey} label="Enabled" value={enabledCount} format={fmtInt} foot="toggle below to change" />
        <StatCard flashKey={flashKey} label="Runs today" value={runsToday} format={fmtInt} foot="sum across active hooks" />
        <StatCard flashKey={flashKey} label="Avg latency" value={activeAvg} format={(n) => `${fmtInt(n)} ms`} foot="mean of active hooks" />
      </div>

      <h3 className="metric-h">Configured hooks</h3>

      <div className="mcp-grid" style={{ gridTemplateColumns: "300px 1fr" }}>
        <div className="mcp-list">
          {HOOKS.map((h, i) => {
            const on = enabledMap[h.id] ?? false;
            const t = h.runs / maxRuns;
            return (
              <button
                key={h.id}
                className={`mcp-item m-row ${h.id === active.id ? "active" : ""}`}
                onClick={() => setSelectedId(h.id)}
                style={{
                  animation: "metric-rise .5s cubic-bezier(.2,.7,.2,1) both",
                  animationDelay: `${i * 40}ms`,
                }}
              >
                <span
                  className={`mcp-dot ${on ? "on" : "off"}`}
                  style={{
                    background: on ? EVENT_META[h.event].color : undefined,
                    transition: "background .25s, filter .25s, transform .25s",
                    filter: on ? "drop-shadow(0 0 6px color-mix(in srgb, var(--brand) 45%, transparent))" : undefined,
                  }}
                />
                <div className="meta">
                  <span className="name">{h.event}</span>
                  <span className="desc">{h.matcher === "*" ? "all tools" : h.matcher}</span>
                </div>
                <span className="m-cost" style={{ ["--t" as string]: `${t}` } as React.CSSProperties}>
                  <span>{h.runs}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mcp-detail metric-card" style={{ padding: 22, animation: "metric-rise .55s cubic-bezier(.2,.7,.2,1) both" }}>
          <div className="mc-glow" />
          <div className="mc-sheen" key={`sheen-${active.id}-${flashKey}`} />
          <div className="row-h" style={{ position: "relative" }}>
            <h2 style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 9, height: 9,
                  borderRadius: "50%",
                  background: EVENT_META[active.event].color,
                  transition: "filter .3s, transform .3s, box-shadow .3s",
                  filter: `drop-shadow(0 0 8px ${EVENT_META[active.event].color})`,
                  boxShadow: `0 0 0 3px color-mix(in srgb, ${EVENT_META[active.event].color} 18%, transparent)`,
                  animation: "status-pulse 2.4s ease-in-out infinite",
                }}
              />
              {active.event}
            </h2>
            <span className="id">
              <span style={{ color: "var(--fg-muted)" }}>matcher · </span>
              <span style={{ color: "var(--fg)", fontWeight: 500 }}>{active.matcher === "*" ? "all" : active.matcher}</span>
            </span>
            <span
              className="status-pill"
              style={{
                ...(isEnabled
                  ? { color: "var(--brand)", background: "color-mix(in srgb, var(--brand) 14%, transparent)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--brand) 38%, transparent)" }
                  : { color: "var(--fg-muted)", background: "color-mix(in srgb, var(--bg-elev) 80%, transparent)", boxShadow: "inset 0 0 0 1px var(--border)" }),
              }}
            >
              {isEnabled ? "enabled" : "disabled"}
            </span>
            <div className="right-actions">
              <button className="btn">Dry run</button>
              <button className="btn">View last output</button>
            </div>
          </div>

          <p style={{ margin: "0 0 18px", color: "var(--fg-dim)", fontSize: 13, position: "relative" }}>{EVENT_META[active.event].desc}</p>

          <div className="field-grid" style={{ position: "relative" }}>
            <div className="k">Enabled</div>
            <div className="v" style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
              <ToggleSwitch
                checked={isEnabled}
                onChange={(next) => setEnabledMap((m) => ({ ...m, [active.id]: next }))}
                label={`${isEnabled ? "Disable" : "Enable"} hook ${active.event}`}
              />
              <span style={{ fontSize: 12, color: isEnabled ? "var(--brand)" : "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>
                {isEnabled ? "on" : "off"}
              </span>
            </div>
            <div className="k">Matcher</div>
            <div className="v">
              <input defaultValue={active.matcher} key={`m-${active.id}`} />
              <div className="hint">Regex match against tool name. Use <code>*</code> to match all.</div>
            </div>
            <div className="k">Command</div>
            <div className="v">
              <input defaultValue={active.command} key={`c-${active.id}`} style={{ fontFamily: "var(--font-mono)" }} />
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

          <h3 className="metric-h" style={{ margin: "22px 0 10px", position: "relative" }}>Runs · last 7 days</h3>
          <div className="table-scroll" style={{ position: "relative" }}>
            <div className="tools-table runs-table" style={{ minWidth: 520 }}>
              <div className="trow head" style={{ gridTemplateColumns: RUN_COLS }}>
                <span>session</span>
                <span>exit</span>
                <span style={{ textAlign: "right" }}>ms</span>
                <span style={{ textAlign: "right" }}>when</span>
              </div>
              {[
                { sess: "sess-9a12", exit: 0, ms: active.avgMs,                 when: active.lastRun },
                { sess: "sess-9a08", exit: 0, ms: Math.floor(active.avgMs * 0.9), when: "18m ago" },
                { sess: "sess-9a04", exit: 1, ms: Math.floor(active.avgMs * 1.8), when: "1h ago" },
              ].map((r, i) => (
                <div
                  key={r.sess}
                  className="trow m-row"
                  style={{ gridTemplateColumns: RUN_COLS, animation: "metric-rise .5s cubic-bezier(.2,.7,.2,1) both", animationDelay: `${i * 40}ms` }}
                >
                  <span className="tname" style={{ fontFamily: "var(--font-mono)", transition: "color .2s" }}>{r.sess}</span>
                  <span className="tdesc" style={r.exit ? { color: "var(--state-error)" } : undefined}>{r.exit}</span>
                  <span className="ncalls" style={{ textAlign: "right" }}>
                    <span className="m-cost" style={{ ["--t" as string]: `${Math.min(1, r.ms / maxAvgMs)}` } as React.CSSProperties}>
                      <span>{r.ms}</span>
                    </span>
                  </span>
                  <span className="ncalls">{r.when}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, format, foot, accent = false, flashKey }: { label: string; value: number; format: (n: number) => string; foot: string; accent?: boolean; flashKey: number }) {
  return (
    <div className={`metric-card${accent ? " is-accent" : ""}`}>
      <div className="mc-glow" />
      <div className="mc-sheen" key={flashKey} />
      <div className="mc-label">{label}</div>
      <div className="mc-value"><AnimatedNumber value={value} format={format} /></div>
      <div className="mc-foot">{foot}</div>
    </div>
  );
}

function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const delta = value - start;
    if (Math.abs(delta) < 1e-9) { setDisplay(value); return; }
    const t0 = performance.now();
    const dur = 850;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = start + delta * eased;
      setDisplay(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{format(display)}</>;
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v3h-3" />
    </svg>
  );
}

function fmtInt(n: number): string { return Math.round(n).toLocaleString(); }
