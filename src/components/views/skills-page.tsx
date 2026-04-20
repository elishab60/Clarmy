"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { SkillDetail } from "./skills/skill-detail";
import { SkillToggleConfirm } from "./skills/skill-toggle-confirm";

export interface SkillRow {
  id: string;
  name: string;
  plugin: string;
  marketplace?: string;
  description: string;
  path: string;
  kind: "rigid" | "flexible";
  enabled: boolean;
  userLevel: boolean;
  invocations7d: number;
  invocations30d: number;
  lastTs: number | null;
}

type Filter = "all" | "on" | "off";

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<SkillRow | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/skills", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { skills: SkillRow[] };
      setSkills(data.skills);
      setErr(null);
    } catch (e) {
      setErr(String(e));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); const t = setInterval(refresh, 15000); return () => clearInterval(t); }, [refresh]);

  const filtered = useMemo(() => {
    const qq = q.toLowerCase();
    return skills.filter((s) => {
      if (filter === "on" && !s.enabled) return false;
      if (filter === "off" && s.enabled) return false;
      if (!qq) return true;
      return s.name.toLowerCase().includes(qq) || s.plugin.toLowerCase().includes(qq) || s.description.toLowerCase().includes(qq);
    });
  }, [skills, q, filter]);

  const active = skills.find((s) => s.id === selectedId) ?? filtered[0] ?? null;

  const onToggle = async (skill: SkillRow) => {
    if (skill.userLevel) return;
    const siblings = skills.filter((s) => s.plugin === skill.plugin);
    if (siblings.length > 1) { setConfirmToggle(skill); return; }
    await performToggle(skill.id);
  };

  const performToggle = async (skillId: string) => {
    const r = await fetch("/api/skills/toggle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ skillId }) });
    if (r.ok) await refresh();
    setConfirmToggle(null);
  };

  return (
    <div className="cfg-shell">
      <div className="cfg-header">
        <div>
          <h1>Skills</h1>
          <p className="sub">Installed skills from plugins. Skills guide how Claude approaches tasks — rigid ones run verbatim, flexible ones adapt to context.</p>
        </div>
        <div className="right">
          <button className="btn" onClick={refresh} disabled={loading}>{loading ? "Loading…" : "Reload"}</button>
        </div>
      </div>

      {err && <div style={{ padding: 12, background: "rgba(239,68,68,0.08)", color: "var(--state-error)", borderRadius: 4, marginBottom: 12, fontSize: 12 }}>Error: {err}</div>}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <div className="model-picker">
          <button className={filter === "all" ? "on" : ""} onClick={() => setFilter("all")}>all · {skills.length}</button>
          <button className={filter === "on" ? "on" : ""} onClick={() => setFilter("on")}>enabled · {skills.filter((s) => s.enabled).length}</button>
          <button className={filter === "off" ? "on" : ""} onClick={() => setFilter("off")}>disabled · {skills.filter((s) => !s.enabled).length}</button>
        </div>
        <input
          style={{ marginLeft: "auto", width: 280, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11.5, color: "var(--fg)" }}
          placeholder="Filter skills…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="mcp-grid">
        <div className="mcp-list">
          {filtered.map((s) => (
            <button key={s.id} className={`mcp-item ${s.id === active?.id ? "active" : ""}`} onClick={() => setSelectedId(s.id)}>
              <span className={`mcp-dot ${s.enabled ? "on" : "off"}`} />
              <div className="meta">
                <span className="name">{s.name}</span>
                <span className="desc">{s.plugin}</span>
              </div>
              <span className="tool-count">{s.invocations7d}</span>
            </button>
          ))}
          {filtered.length === 0 && !loading && <div className="mcp-empty">No matches.</div>}
        </div>

        {active
          ? <SkillDetail skill={active} onToggle={() => onToggle(active)} />
          : <div className="mcp-empty">Select a skill to view details.</div>}
      </div>

      {confirmToggle && (
        <SkillToggleConfirm
          skill={confirmToggle}
          siblings={skills.filter((s) => s.plugin === confirmToggle.plugin)}
          onCancel={() => setConfirmToggle(null)}
          onConfirm={() => performToggle(confirmToggle.id)}
        />
      )}
    </div>
  );
}
