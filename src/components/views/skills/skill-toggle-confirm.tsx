"use client";

import type { SkillRow } from "../skills-page";

export function SkillToggleConfirm({ skill, siblings, onCancel, onConfirm }: {
  skill: SkillRow; siblings: SkillRow[]; onCancel: () => void; onConfirm: () => void;
}) {
  const action = skill.enabled ? "Disable" : "Enable";
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 480, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: 6, padding: 20 }}>
        <h2 style={{ margin: "0 0 10px", fontSize: 15 }}>{action} plugin <span style={{ fontFamily: "var(--font-mono)" }}>{skill.plugin}</span>?</h2>
        <p style={{ fontSize: 12.5, color: "var(--fg-dim)", lineHeight: 1.55 }}>
          Skills can only be toggled by enabling/disabling their parent plugin. This action will {action.toLowerCase()} <strong>{siblings.length} skills</strong>:
        </p>
        <ul style={{ maxHeight: 200, overflow: "auto", margin: "10px 0", padding: 12, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11.5, listStyle: "none" }}>
          {siblings.map((s) => <li key={s.id} style={{ padding: "2px 0" }}>{s.name}</li>)}
        </ul>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" onClick={onConfirm}>{action} plugin</button>
        </div>
      </div>
    </div>
  );
}
