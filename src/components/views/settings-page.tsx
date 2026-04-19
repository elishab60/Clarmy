"use client";

import { useState } from "react";
import type { ApprovalMode, ModelId } from "@/lib/shared/types";

type Tab = "general" | "models" | "approvals" | "telemetry" | "account";

const TABS: { id: Tab; label: string; ico: string; desc: string }[] = [
  { id: "general",   label: "General",   ico: "◐", desc: "Theme, runtime, notify" },
  { id: "models",    label: "Models",    ico: "◆", desc: "Default & provider"    },
  { id: "approvals", label: "Approvals", ico: "✓", desc: "Tool gating rules"     },
  { id: "telemetry", label: "Telemetry", ico: "◉", desc: "Local logs & redact"   },
  { id: "account",   label: "Account",   ico: "◎", desc: "Identity & plan"       },
];

const DEFAULT_ALLOW = `Read
Grep
Glob
TodoWrite
Bash(ls*)
Bash(git status)
Bash(git diff*)
Bash(pnpm typecheck)`;

const DEFAULT_DENY = `Bash(rm -rf*)
Bash(git push --force*)
Bash(git reset --hard*)`;

function countRules(text: string): number {
  return text.split("\n").filter((l) => l.trim().length > 0).length;
}

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [defaultModel, setDefaultModel] = useState<ModelId>("opus-4.7");
  const [defaultApproval, setDefaultApproval] = useState<ApprovalMode>("prompt");
  const [maxParallel, setMaxParallel] = useState(6);
  const [theme, setTheme] = useState<"dark" | "light" | "system">("dark");
  const [telemetry, setTelemetry] = useState(true);
  const [notifications, setNotifications] = useState(true);
  const [allowList, setAllowList] = useState(DEFAULT_ALLOW);
  const [denyList, setDenyList] = useState(DEFAULT_DENY);
  const [dirty, setDirty] = useState(false);

  const mark = <T,>(set: (v: T) => void) => (v: T) => { set(v); setDirty(true); };

  const onSave = () => setDirty(false);
  const onReset = () => {
    setDefaultModel("opus-4.7");
    setDefaultApproval("prompt");
    setMaxParallel(6);
    setTheme("dark");
    setTelemetry(true);
    setNotifications(true);
    setAllowList(DEFAULT_ALLOW);
    setDenyList(DEFAULT_DENY);
    setDirty(false);
  };

  return (
    <div className="settings-shell">
      <div className="settings-header">
        <div>
          <h1>Settings</h1>
          <p className="sub">
            Per-user preferences for Cockpit. These apply to every new session you spawn from this machine.
          </p>
        </div>
        <div className="right">
          {dirty && <span className="settings-dirty">Unsaved</span>}
          <button className="btn" onClick={onReset}>Reset to defaults</button>
          <button
            className="btn primary"
            onClick={onSave}
            aria-disabled={!dirty}
            disabled={!dirty}
          >
            Save changes
          </button>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`settings-nav-item ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="ico">{t.ico}</span>
              <span className="lbl">{t.label}</span>
              <span className="desc">{t.desc}</span>
            </button>
          ))}
        </nav>

        <div className="settings-panel">
          {tab === "general" && (
            <>
              <div className="settings-panel-head">
                <h2>General</h2>
                <p className="lede">Appearance, concurrency, and notifications.</p>
              </div>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Appearance</h3></header>
                <div className="settings-section-body">
                  <div className="field-grid">
                    <div className="k">Theme</div>
                    <div className="v">
                      <div className="model-picker">
                        {(["dark", "light", "system"] as const).map((v) => (
                          <button key={v} className={theme === v ? "on" : ""} onClick={() => mark(setTheme)(v)}>{v}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Runtime</h3></header>
                <div className="settings-section-body">
                  <div className="field-grid">
                    <div className="k">Max parallel sessions</div>
                    <div className="v">
                      <input
                        type="number"
                        min={1}
                        max={24}
                        value={maxParallel}
                        onChange={(e) => mark(setMaxParallel)(Number(e.target.value))}
                        style={{ maxWidth: 120 }}
                      />
                      <div className="hint">Hard cap on concurrent SDK generators. Extra launches queue.</div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Notifications</h3></header>
                <div className="settings-section-body">
                  <div className="field-grid">
                    <div className="k">Desktop notifications</div>
                    <div className="v">
                      <button
                        className={`toggle ${notifications ? "on" : ""}`}
                        onClick={() => mark(setNotifications)(!notifications)}
                      >
                        <span className="sw" />
                        <span>{notifications ? "on" : "off"}</span>
                      </button>
                      <div className="hint">Notify on pending approvals and session errors while Cockpit is in the background.</div>
                    </div>

                    <div className="k">Command palette</div>
                    <div className="v">
                      <input defaultValue="⌘K" readOnly style={{ maxWidth: 120, fontFamily: "var(--font-mono)" }} />
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === "models" && (
            <>
              <div className="settings-panel-head">
                <h2>Models</h2>
                <p className="lede">Default model and provider routing for new sessions.</p>
              </div>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Default</h3></header>
                <div className="settings-section-body">
                  <div className="field-grid">
                    <div className="k">Default model</div>
                    <div className="v">
                      <div className="model-picker">
                        {(["opus-4.7", "sonnet-4.6", "haiku-4.5"] as ModelId[]).map((m) => (
                          <button key={m} className={defaultModel === m ? "on" : ""} onClick={() => mark(setDefaultModel)(m)}>{m}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Provider</h3></header>
                <div className="settings-section-body">
                  <div className="field-grid">
                    <div className="k">ANTHROPIC_API_KEY</div>
                    <div className="v">
                      <input
                        defaultValue="sk-ant-api03-********************"
                        type="password"
                        style={{ fontFamily: "var(--font-mono)" }}
                        onChange={() => setDirty(true)}
                      />
                      <div className="hint">Read from the environment at boot. Changing requires a restart.</div>
                    </div>
                    <div className="k">Base URL</div>
                    <div className="v">
                      <input
                        defaultValue="https://api.anthropic.com"
                        style={{ fontFamily: "var(--font-mono)" }}
                        onChange={() => setDirty(true)}
                      />
                    </div>
                    <div className="k">Fallback routing</div>
                    <div className="v">
                      <select defaultValue="auto" onChange={() => setDirty(true)}>
                        <option value="auto">auto — retry on rate-limit with smaller model</option>
                        <option value="strict">strict — fail fast, never downgrade</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === "approvals" && (
            <>
              <div className="settings-panel-head">
                <h2>Approvals</h2>
                <p className="lede">How Cockpit prompts you before running tools.</p>
              </div>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Mode</h3></header>
                <div className="settings-section-body">
                  <div className="field-grid">
                    <div className="k">Default mode</div>
                    <div className="v">
                      <select
                        value={defaultApproval}
                        onChange={(e) => mark(setDefaultApproval)(e.target.value as ApprovalMode)}
                      >
                        <option value="auto">auto — run all tools without asking</option>
                        <option value="prompt">prompt — ask before destructive tools</option>
                        <option value="strict">strict — ask for every tool call</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <header className="settings-section-head">
                  <h3>Auto-approve</h3>
                  <span className="count">{countRules(allowList)} rules</span>
                </header>
                <div className="settings-section-body">
                  <div className="rule-editor">
                    <div className="rule-editor-head">
                      <span className="rcount">allow</span>
                      <span className="spacer" />
                      <button className="r-add" type="button">+ add rule</button>
                    </div>
                    <textarea
                      rows={6}
                      value={allowList}
                      onChange={(e) => mark(setAllowList)(e.target.value)}
                    />
                  </div>
                  <div className="hint" style={{ fontSize: 10.5, color: "var(--fg-muted)", marginTop: 6 }}>
                    One rule per line. Use <code>Tool(arg-glob)</code> for scoped matchers.
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <header className="settings-section-head">
                  <h3>Deny</h3>
                  <span className="count">{countRules(denyList)} rules</span>
                </header>
                <div className="settings-section-body">
                  <div className="rule-editor">
                    <div className="rule-editor-head">
                      <span className="rcount" style={{ color: "var(--state-error)" }}>deny</span>
                      <span className="spacer" />
                      <button className="r-add" type="button">+ add rule</button>
                    </div>
                    <textarea
                      rows={4}
                      value={denyList}
                      onChange={(e) => mark(setDenyList)(e.target.value)}
                    />
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === "telemetry" && (
            <>
              <div className="settings-panel-head">
                <h2>Telemetry</h2>
                <p className="lede">What Cockpit records about your sessions. Nothing leaves your machine.</p>
              </div>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Storage</h3></header>
                <div className="settings-section-body">
                  <div className="field-grid">
                    <div className="k">Local session logs</div>
                    <div className="v">
                      <button
                        className={`toggle ${telemetry ? "on" : ""}`}
                        onClick={() => mark(setTelemetry)(!telemetry)}
                      >
                        <span className="sw" />
                        <span>{telemetry ? "on" : "off"}</span>
                      </button>
                      <div className="hint">Persist WS patches to <code>.cockpit/sessions/*.jsonl</code> for replay.</div>
                    </div>
                    <div className="k">Retention</div>
                    <div className="v">
                      <select defaultValue="30d" onChange={() => setDirty(true)}>
                        <option value="7d">7 days</option>
                        <option value="30d">30 days</option>
                        <option value="forever">keep forever</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Privacy</h3></header>
                <div className="settings-section-body">
                  <div className="field-grid">
                    <div className="k">Redact secrets</div>
                    <div className="v">
                      <select defaultValue="on" onChange={() => setDirty(true)}>
                        <option value="on">on — mask env, tokens, passwords</option>
                        <option value="off">off — store raw (dangerous)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>
            </>
          )}

          {tab === "account" && (
            <>
              <div className="settings-panel-head">
                <h2>Account</h2>
                <p className="lede">Signed-in identity and billing scope.</p>
              </div>

              <section className="settings-section">
                <header className="settings-section-head"><h3>Identity</h3></header>
                <div className="settings-section-body">
                  <div className="account-identity">
                    <div className="account-avatar">E</div>
                    <div className="who">
                      <span className="name">elishabajemon</span>
                      <span className="mail">elishabajemon60@icloud.com</span>
                    </div>
                  </div>

                  <div className="kv-readonly">
                    <div className="k">Workspace</div>
                    <div className="v">personal</div>
                    <div className="k">Plan</div>
                    <div className="v"><span className="plan-pill">Max — 1M context</span></div>
                    <div className="k">Region</div>
                    <div className="v">us-east-1</div>
                  </div>
                </div>
                <div className="settings-footnote">
                  <code>cockpit@0.1.0</code> · Node 24 LTS · @anthropic-ai/claude-agent-sdk
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
