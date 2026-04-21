"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { SkillRow } from "../skills-page";
import { ToggleSwitch } from "@/components/ui/toggle-switch";

interface Invocation { skillName: string; sessionId: string; ts: number; ok: boolean; prompt: string; }

const labelCell: CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--fg-muted)",
  whiteSpace: "nowrap",
  paddingTop: 2,
};
const valueCell: CSSProperties = {
  fontSize: 13,
  color: "var(--fg)",
  lineHeight: 1.5,
};
const monoValue: CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 11,
  color: "var(--fg-muted)",
  lineHeight: 1.5,
  wordBreak: "break-all",
  overflowWrap: "anywhere",
};

function KindBadge({ kind }: { kind: "rigid" | "flexible" | "beta" }) {
  return <span className={`kind-badge kind-${kind}`}>{kind}</span>;
}

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
        <h2 title={skill.name}>{skill.name}</h2>
        <span className="id">{skill.plugin}:{skill.name}</span>
        <span className="status-pill" style={!skill.enabled ? { color: "var(--fg-muted)", background: "rgba(255,255,255,0.04)", boxShadow: "inset 0 0 0 1px var(--border)" } : undefined}>
          {skill.enabled ? "enabled" : "disabled"}
        </span>
        <KindBadge kind={skill.kind} />
        <div className="right-actions" style={{ alignItems: "center", gap: 10 }}>
          <button className="btn" onClick={loadBody}>{showBody ? "Hide body" : "View skill"}</button>
          {!skill.userLevel && (
            <ToggleSwitch
              checked={skill.enabled}
              onChange={onToggle}
              label={`Toggle ${skill.name}`}
            />
          )}
        </div>
      </div>

      <p style={{ margin: "0 0 22px", color: "var(--fg)", fontSize: 14, lineHeight: 1.65 }}>{skill.description}</p>

      <div className="field-grid">
        <div style={labelCell}>Source</div>
        <div style={monoValue} title={skill.path}>{skill.path}</div>
        <div style={labelCell}>Trigger</div>
        <div style={valueCell}><code className="trigger-pill">/{skill.userLevel ? "" : skill.plugin + ":"}{skill.name}</code></div>
        <div style={labelCell}>Invocations</div>
        <div style={{ ...valueCell, fontFamily: "var(--font-mono)" }}>
          <span style={{ color: "var(--fg)" }}>{skill.invocations7d}</span>
          <span style={{ color: "var(--fg-muted)", margin: "0 6px" }}>·</span>
          <span style={{ color: "var(--fg-dim)" }}>{skill.invocations30d}</span>
          <span style={{ color: "var(--fg-muted)", marginLeft: 8, fontSize: 11 }}>(7d · 30d)</span>
        </div>
      </div>

      {showBody && body && (
        <pre style={{ maxHeight: 320, overflow: "auto", padding: 14, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 11.5, lineHeight: 1.55, fontFamily: "var(--font-mono)", color: "var(--fg-dim)", margin: "18px 0", whiteSpace: "pre-wrap" }}>{body}</pre>
      )}

      <h3 className="metric-h" style={{ marginTop: 24 }}>Recent invocations</h3>
      <table className="skill-runs-table">
        <thead>
          <tr><th>session</th><th>prompt</th><th className="t-right">when</th><th className="t-right">ok</th></tr>
        </thead>
        <tbody>
          {invs.length === 0 && <tr><td colSpan={4} className="empty-cell">no invocations recorded</td></tr>}
          {invs.map((r, i) => {
            const isTool = !r.prompt;
            return (
              <tr key={`${r.sessionId}-${i}`}>
                <td className="sess">{r.sessionId.slice(0, 8)}</td>
                <td className="prompt" title={r.prompt || "(tool_use)"}><span className={isTool ? "tool-use" : undefined}>{r.prompt || "(tool_use)"}</span></td>
                <td className="when">{r.ts ? new Date(r.ts).toLocaleString() : "—"}</td>
                <td className="ok-cell"><span className={`ok-badge ${r.ok ? "is-ok" : "is-err"}`}>{r.ok ? "ok" : "err"}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
