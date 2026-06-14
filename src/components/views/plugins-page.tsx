"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { KebabMenu } from "@/components/ui/kebab-menu";
import { PluginDetailModal } from "@/components/views/plugins/plugin-detail-modal";

export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly version: string;
  readonly skills: number;
  readonly agents: number;
  readonly hooks: number;
  readonly status: "enabled" | "disabled" | "update";
  readonly desc: string;
}

const PLUGINS: Plugin[] = [
  { id: "superpowers",     name: "superpowers",     source: "anthropics/claude-code-superpowers", version: "v2.3.1", skills: 14, agents: 3, hooks: 2, status: "enabled",  desc: "TDD, debugging, brainstorming, and planning workflows for disciplined coding sessions." },
  { id: "vercel",          name: "vercel",          source: "vercel/claude-code-plugin",          version: "v1.8.0", skills: 22, agents: 3, hooks: 1, status: "enabled",  desc: "Next.js, AI SDK, Functions, Storage, CLI, and Marketplace guidance for Vercel projects." },
  { id: "claude-code",     name: "claude-code",     source: "anthropics/claude-code-core",        version: "v0.9.4", skills: 1,  agents: 0, hooks: 0, status: "enabled",  desc: "Core helpers: the Claude API skill, the init command, and default settings migrations." },
  { id: "huggingface",     name: "huggingface",     source: "huggingface/claude-code-skills",     version: "v0.4.2", skills: 8,  agents: 1, hooks: 0, status: "enabled",  desc: "HF Hub operations, datasets, training jobs, paper publishing, and evaluation scoring." },
  { id: "feature-dev",     name: "feature-dev",     source: "anthropics/feature-dev",             version: "v1.0.0", skills: 1,  agents: 3, hooks: 0, status: "enabled",  desc: "Guided feature development: code-explorer, code-architect, code-reviewer subagents." },
  { id: "commit-commands", name: "commit-commands", source: "anthropics/commit-commands",         version: "v0.6.0", skills: 3,  agents: 0, hooks: 0, status: "enabled",  desc: "Slash commands for commit, commit-push-pr, and cleaning gone branches." },
  { id: "code-review",     name: "code-review",     source: "anthropics/code-review",             version: "v0.3.1", skills: 1,  agents: 1, hooks: 0, status: "enabled",  desc: "PR code review command with opinionated standards." },
  { id: "ralph-loop",      name: "ralph-loop",      source: "ralph/loop-plugin",                  version: "v0.2.4", skills: 2,  agents: 0, hooks: 0, status: "update",   desc: "Run a slash command on a recurring interval from the current session." },
  { id: "frontend-design", name: "frontend-design", source: "anthropics/frontend-design",         version: "v1.1.0", skills: 1,  agents: 0, hooks: 0, status: "enabled",  desc: "Distinctive, production-grade frontend interfaces with high design quality." },
  { id: "playwright-mcp",  name: "playwright-mcp",  source: "microsoft/playwright-mcp",           version: "v0.7.0", skills: 0,  agents: 0, hooks: 0, status: "disabled", desc: "Browser automation via MCP — navigation, click, type, screenshots." },
];

export function PluginsPage() {
  const [plugins, setPlugins] = useState<Plugin[]>(PLUGINS);
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const [flashKey, setFlashKey] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(PLUGINS.map((p) => [p.id, p.status !== "disabled"]))
  );
  useEffect(() => { setFlashKey((k) => k + 1); }, []);

  const setEnabled = (id: string, next: boolean) => setEnabledMap((m) => ({ ...m, [id]: next }));
  const uninstall = (id: string) => {
    setPlugins((ps) => ps.filter((p) => p.id !== id));
    setDetailId((d) => (d === id ? null : d));
  };
  const update = (id: string) => {
    setPlugins((ps) => ps.map((p) => (p.id === id ? { ...p, status: "enabled" } : p)));
    setEnabled(id, true);
  };

  const filtered = plugins.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.source.toLowerCase().includes(q.toLowerCase()) ||
    p.desc.toLowerCase().includes(q.toLowerCase()),
  );

  const isOn = (p: Plugin) => enabledMap[p.id] ?? false;
  const total = plugins.length;
  const enabled = plugins.filter((p) => isOn(p)).length;
  const updates = plugins.filter((p) => p.status === "update").length;
  const totalSkills = plugins.reduce((a, p) => a + p.skills, 0);
  const totalAgents = plugins.reduce((a, p) => a + p.agents, 0);
  const totalHooks = plugins.reduce((a, p) => a + p.hooks, 0);
  const shipped = totalSkills + totalAgents + totalHooks;

  const maxContent = Math.max(1, ...plugins.map((p) => p.skills + p.agents + p.hooks));
  const detail = plugins.find((p) => p.id === detailId) ?? null;

  return (
    <div className="cfg-shell metrics-shell">
      <div className="cfg-header">
        <div>
          <h1>Plugins</h1>
          <p className="sub">Installed plugin bundles. Each plugin can ship skills, subagents, and hooks that attach to every Cockpit session.</p>
        </div>
        <div className="right">
          <button
            className="btn"
            style={{ transition: "border-color .25s, box-shadow .35s, transform .25s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand) 35%, var(--border))"; e.currentTarget.style.boxShadow = "0 8px 22px -14px color-mix(in srgb, var(--brand) 55%, transparent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = ""; e.currentTarget.style.boxShadow = ""; }}
          >
            Browse marketplace
          </button>
          <button
            className="btn primary"
            style={{ transition: "box-shadow .35s, transform .25s, filter .25s" }}
            onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 10px 28px -12px color-mix(in srgb, var(--brand) 75%, transparent)"; e.currentTarget.style.filter = "brightness(1.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.boxShadow = ""; e.currentTarget.style.filter = ""; }}
          >
            Install from Git
          </button>
        </div>
      </div>

      <div className="stat-grid">
        <StatCard flashKey={flashKey} label="Plugins installed" value={total} foot={`${enabled} enabled · ${total - enabled} off`} accent />
        <StatCard flashKey={flashKey} label="Updates available" value={updates} foot={updates ? "run Update to refresh" : "all up to date"} />
        <StatCard flashKey={flashKey} label="Skills shipped"    value={totalSkills} foot={`${shipped} total additions`} />
        <StatCard flashKey={flashKey} label="Subagents shipped" value={totalAgents} foot="attach to every session" />
        <StatCard flashKey={flashKey} label="Hooks shipped"     value={totalHooks} foot="pre/post lifecycle" />
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          style={{
            width: 320,
            padding: "6px 10px",
            background: "var(--bg)",
            border: `1px solid ${focused ? "color-mix(in srgb, var(--brand) 55%, var(--border))" : "var(--border)"}`,
            borderRadius: 4,
            fontSize: 11.5,
            color: "var(--fg)",
            outline: "none",
            transition: "border-color .25s, box-shadow .25s",
            boxShadow: focused ? "0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent)" : "none",
          }}
          placeholder="Filter plugins…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
      </div>

      <h3 className="metric-h">Installed plugins</h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {filtered.map((p, i) => {
          const content = p.skills + p.agents + p.hooks;
          const t = content / maxContent;
          const on = isOn(p);
          const accent = p.status === "update";
          const cardStyle: CSSProperties = {
            padding: "16px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
            animationDelay: `${Math.min(i, 12) * 40}ms`,
            ["--t" as string]: `${t}`,
          } as CSSProperties;
          return (
            <div key={p.id} className={`metric-card${accent ? " is-accent" : ""}`} style={cardStyle}>
              <div className="mc-glow" />
              <div className="mc-sheen" key={flashKey} />
              <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  className={`mcp-dot ${on ? "on" : p.status === "update" ? "err" : "off"}`}
                  style={{ width: 8, height: 8, borderRadius: "50%", transition: "filter .25s, transform .25s" }}
                  aria-hidden
                />
                <span style={{ fontSize: 14, color: "var(--fg)", fontWeight: 600 }} title={p.name}>{p.name}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-muted)", marginLeft: "auto" }}>{p.version}</span>
                <ToggleSwitch
                  checked={on}
                  onChange={(next) => setEnabled(p.id, next)}
                  size="sm"
                  label={`${on ? "Disable" : "Enable"} ${p.name}`}
                />
              </div>
              <div style={{ position: "relative", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }} title={p.source}>{p.source}</div>
              <p style={{ position: "relative", margin: 0, fontSize: 13, color: "var(--fg-dim)", lineHeight: 1.55, minHeight: 40 }}>{p.desc}</p>
              <div style={{ position: "relative", display: "flex", gap: 14, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)" }}>
                <span><AnimatedNumber value={p.skills} /> skills</span>
                <span><AnimatedNumber value={p.agents} /> agents</span>
                <span><AnimatedNumber value={p.hooks} /> hooks</span>
              </div>
              <div style={{ position: "relative", display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
                {p.status === "update" && <FooterBtn primary onClick={() => update(p.id)}>Update available</FooterBtn>}
                <FooterBtn onClick={() => setDetailId(p.id)}>Configure</FooterBtn>
                <div style={{ marginLeft: "auto" }}>
                  <KebabMenu
                    ariaLabel={`Actions for ${p.name}`}
                    actions={[
                      { label: "Configure", onSelect: () => setDetailId(p.id) },
                      { label: on ? "Disable" : "Enable", onSelect: () => setEnabled(p.id, !on) },
                      { label: "Uninstall", danger: true, onSelect: () => uninstall(p.id) },
                    ]}
                  />
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "var(--fg-muted)" }}>
            No plugins match “{q}”.
          </div>
        )}
      </div>

      {detail && (
        <PluginDetailModal
          plugin={detail}
          enabled={isOn(detail)}
          onToggle={(next) => setEnabled(detail.id, next)}
          onUpdate={() => update(detail.id)}
          onUninstall={() => uninstall(detail.id)}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, foot, accent = false, flashKey }: { label: string; value: number; foot: string; accent?: boolean; flashKey: number }) {
  return (
    <div className={`metric-card${accent ? " is-accent" : ""}`}>
      <div className="mc-glow" />
      <div className="mc-sheen" key={flashKey} />
      <div className="mc-label">{label}</div>
      <div className="mc-value"><AnimatedNumber value={value} /></div>
      <div className="mc-foot">{foot}</div>
    </div>
  );
}

function FooterBtn({ children, primary = false, ghost = false, onClick }: { children: React.ReactNode; primary?: boolean; ghost?: boolean; onClick?: () => void }) {
  const cls = `btn${primary ? " primary" : ""}${ghost ? " ghost" : ""}`;
  const flex = ghost ? undefined : 1;
  return (
    <button
      className={cls}
      onClick={onClick}
      style={{ flex, transition: "border-color .25s, box-shadow .3s, filter .25s, transform .2s" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand) 40%, var(--border))";
        e.currentTarget.style.boxShadow = primary
          ? "0 10px 26px -12px color-mix(in srgb, var(--brand) 75%, transparent)"
          : "0 6px 18px -12px color-mix(in srgb, var(--brand) 55%, transparent)";
        if (primary) e.currentTarget.style.filter = "brightness(1.08)";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "";
        e.currentTarget.style.boxShadow = "";
        e.currentTarget.style.filter = "";
        e.currentTarget.style.transform = "";
      }}
    >
      {children}
    </button>
  );
}

function AnimatedNumber({ value }: { value: number }) {
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
      setDisplay(start + delta * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{Math.round(display).toLocaleString()}</>;
}
