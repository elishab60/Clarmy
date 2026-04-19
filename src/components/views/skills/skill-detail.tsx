"use client";

import { useEffect, useState } from "react";
import type { SkillRow } from "../skills-page";

interface Invocation { skillName: string; sessionId: string; ts: number; ok: boolean; prompt: string; }

export function SkillDetail({ skill, onToggle }: { skill: SkillRow; onToggle: () => void }) {
  const [body, setBody] = useState<string | null>(null);
  const [showBody, setShowBody] = useState(false);
  const [invs, setInvs] = useState<Invocation[]>([]);

  useEffect(() => {
    setBody(null); setShowBody(false);
    fetch(`/api/skills/${encodeURIComponent(skill.id)}/invocations?limit=20`, { cache: "no-store" })
      .then((r) => r.ok ? r.json() : { invocations: [] })
      .then((j: { invocations: Invocation[] }) => setInvs(j.invocations))
      .catch(() => setInvs([]));
  }, [skill.id]);

  const loadBody = async () => {
    if (body != null) { setShowBody((v) => !v); return; }
    const r = await fetch(`/api/skills/${encodeURIComponent(skill.id)}/body`);
    const j = (await r.json()) as { body?: string };
    setBody(j.body ?? "(unavailable)");
    setShowBody(true);
  };

  return (
    <div className="mcp-detail">
      <div className="row-h">
        <h2>{skill.name}</h2>
        <span className="id">{skill.plugin}:{skill.name}</span>
        <span className="status-pill" style={!skill.enabled ? { color: "var(--fg-muted)", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px var(--border)" } : undefined}>
          {skill.enabled ? "enabled" : "disabled"}
        </span>
        <span className={`tperm ${skill.kind === "rigid" ? "ask" : ""}`} style={{ justifySelf: "unset" }}>{skill.kind}</span>
        <div className="right-actions">
          <button className="btn" onClick={loadBody}>{showBody ? "Hide body" : "View skill"}</button>
          {!skill.userLevel && <button className="btn" onClick={onToggle}>{skill.enabled ? "Disable" : "Enable"}</button>}
        </div>
      </div>

      <p style={{ margin: "0 0 18px", color: "var(--fg-dim)", fontSize: 13, lineHeight: 1.55 }}>{skill.description}</p>

      <div className="field-grid">
        <div className="k">Source</div>
        <div className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-muted)", paddingTop: 8 }}>{skill.path}</div>
        <div className="k">Trigger</div>
        <div className="v"><input defaultValue={`/${skill.userLevel ? "" : skill.plugin + ":"}${skill.name}`} readOnly /></div>
        <div className="k">Invocations (7d · 30d)</div>
        <div className="v" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg)", paddingTop: 8 }}>{skill.invocations7d} · {skill.invocations30d}</div>
      </div>

      {showBody && body && (
        <pre style={{ maxHeight: 320, overflow: "auto", padding: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg-dim)", marginBottom: 18, whiteSpace: "pre-wrap" }}>{body}</pre>
      )}

      <h3 style={{ margin: "0 0 10px", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--fg-faint)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>Recent invocations</h3>
      <div className="tools-table">
        <div className="trow head"><span>session</span><span>prompt</span><span style={{ textAlign: "right" }}>when</span><span style={{ textAlign: "right" }}>ok</span></div>
        {invs.length === 0 && <div className="trow"><span className="tdesc" style={{ gridColumn: "1 / -1", color: "var(--fg-muted)" }}>no invocations recorded</span></div>}
        {invs.map((r, i) => (
          <div key={`${r.sessionId}-${i}`} className="trow">
            <span className="tname">{r.sessionId.slice(0, 8)}</span>
            <span className="tdesc">{r.prompt || "(tool_use)"}</span>
            <span className="ncalls">{r.ts ? new Date(r.ts).toLocaleString() : "—"}</span>
            <span className={`tperm ${r.ok ? "" : "ask"}`} style={!r.ok ? { color: "var(--state-error)" } : undefined}>{r.ok ? "ok" : "err"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
