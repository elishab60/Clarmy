"use client";

import { useState } from "react";

interface Plugin {
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
  const [q, setQ] = useState("");

  const filtered = PLUGINS.filter((p) =>
    p.name.toLowerCase().includes(q.toLowerCase()) ||
    p.source.toLowerCase().includes(q.toLowerCase()) ||
    p.desc.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>Plugins</h1>
          <p className="sub">Installed plugin bundles. Each plugin can ship skills, subagents, and hooks that attach to every Cockpit session.</p>
        </div>
        <div className="right">
          <button className="btn">Browse marketplace</button>
          <button className="btn primary">Install from Git</button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <input
          style={{ width: 320, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11.5, color: "var(--fg)" }}
          placeholder="Filter plugins…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {filtered.map((p) => (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-tile)", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={`mcp-dot ${p.status === "enabled" ? "on" : p.status === "update" ? "err" : "off"}`} style={{ width: 7, height: 7, borderRadius: "50%" }} />
              <span style={{ fontSize: 14, color: "var(--fg)", fontWeight: 500 }}>{p.name}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-muted)", marginLeft: "auto" }}>{p.version}</span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-muted)" }}>{p.source}</div>
            <p style={{ margin: 0, fontSize: 12, color: "var(--fg-dim)", lineHeight: 1.5, minHeight: 36 }}>{p.desc}</p>
            <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 10.5, color: "var(--fg-muted)" }}>
              <span>{p.skills} skills</span>
              <span>{p.agents} agents</span>
              <span>{p.hooks} hooks</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              {p.status === "update" && <button className="btn primary" style={{ flex: 1 }}>Update available</button>}
              {p.status === "enabled" && <button className="btn" style={{ flex: 1 }}>Configure</button>}
              {p.status === "disabled" && <button className="btn" style={{ flex: 1 }}>Enable</button>}
              <button className="btn ghost">…</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center", color: "var(--fg-muted)" }}>
            No plugins match “{q}”.
          </div>
        )}
      </div>
    </div>
  );
}
