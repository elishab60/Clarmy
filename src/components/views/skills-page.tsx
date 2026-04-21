"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<SkillRow | null>(null);
  const [flashKey, setFlashKey] = useState(0);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/skills", { cache: "no-store" });
      if (!r.ok) throw new Error(`${r.status}`);
      const data = (await r.json()) as { skills: SkillRow[] };
      setSkills(data.skills);
      setErr(null);
      setFlashKey((k) => k + 1);
    } catch (e) { setErr(String(e)); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void refresh(); const t = setInterval(() => void refresh(), 15000); return () => clearInterval(t); }, [refresh]);

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

  const stats = useMemo(() => {
    const enabledCount = skills.filter((s) => s.enabled).length;
    const total7d = skills.reduce((a, s) => a + s.invocations7d, 0);
    let topName = "—"; let topInv = -1;
    for (const s of skills) { if (s.invocations7d > topInv) { topInv = s.invocations7d; topName = s.name; } }
    return { total: skills.length, enabled: enabledCount, invocations7d: total7d, topName, topInv: Math.max(0, topInv) };
  }, [skills]);

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

  const inputStyle: React.CSSProperties = { marginLeft: "auto", width: 280, padding: "6px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 11.5, color: "var(--fg)", transition: "border-color .2s, box-shadow .2s" };

  return (
    <div className="cfg-shell metrics-shell">
      <div className="cfg-header">
        <div>
          <h1>Skills</h1>
          <p className="sub">Installed skills from plugins. Skills guide how Claude approaches tasks — rigid ones run verbatim, flexible ones adapt to context.</p>
        </div>
        <div className="right">
          <button className={`btn btn-refresh${refreshing ? " is-spinning" : ""}`} onClick={() => void refresh()} disabled={loading} aria-label="Refresh skills">
            <RefreshIcon /><span>Refresh</span>
          </button>
        </div>
      </div>

      {err && <div style={{ color: "var(--state-error)", fontSize: 12, marginBottom: 14 }}>Error: {err}</div>}

      {loading && skills.length === 0 && (
        <div className="stat-grid">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="metric-skel" />)}</div>
      )}

      {skills.length > 0 && (
        <div className="stat-grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <StatCard flashKey={flashKey} label="Skills (total)" value={stats.total} foot={`${stats.enabled} enabled · ${stats.total - stats.enabled} disabled`} />
          <StatCard flashKey={flashKey} label="Enabled" value={stats.enabled} foot={`${pct(stats.enabled, stats.total)}% of installed`} accent />
          <StatCard flashKey={flashKey} label="Invocations · 7d" value={stats.invocations7d} foot="across all skills" />
          <StatCard flashKey={flashKey} label="Most used · 7d" value={stats.topInv} foot={stats.topName} />
        </div>
      )}

      <h3 className="metric-h">Filters</h3>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
        <div className="skills-pills" role="tablist" style={{ display: "flex", gap: 6 }}>
          <PillBtn active={filter === "all"} onClick={() => setFilter("all")} label="all" count={skills.length} />
          <PillBtn active={filter === "on"} onClick={() => setFilter("on")} label="enabled" count={skills.filter((s) => s.enabled).length} />
          <PillBtn active={filter === "off"} onClick={() => setFilter("off")} label="disabled" count={skills.filter((s) => !s.enabled).length} />
        </div>
        <input
          style={inputStyle}
          onFocus={(e) => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand) 45%, var(--border))"; e.currentTarget.style.boxShadow = "0 0 0 3px color-mix(in srgb, var(--brand) 14%, transparent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
          placeholder="Filter skills…" value={q} onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <h3 className="metric-h">Installed · {filtered.length}</h3>
      <div className="mcp-grid">
        <div className="mcp-list skill-list" style={{ display: "flex", flexDirection: "column", gap: 0, padding: 4, background: "transparent", border: "1px solid var(--border)", borderRadius: 6 }}>
          {filtered.map((s) => (
            <SkillCard
              key={s.id}
              skill={s}
              isActive={s.id === active?.id}
              onSelect={() => setSelectedId(s.id)}
            />
          ))}
          {filtered.length === 0 && !loading && (
            <div className="mcp-empty" style={{ textAlign: "center", padding: "24px 12px" }}>No matches.</div>
          )}
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
          onConfirm={() => void performToggle(confirmToggle.id)}
        />
      )}
    </div>
  );
}

function SkillCard({ skill, isActive, onSelect }: { skill: SkillRow; isActive: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      className={`skill-row${isActive ? " is-active" : ""}`}
      aria-pressed={isActive}
    >
      <span className="skill-row-name" title={skill.name}>{skill.name}</span>
      <span className="skill-row-meta">
        <KindBadge kind={skill.kind} />
        <span className="skill-row-count" title={`${skill.invocations7d} invocations (7d)`}>{fmtInt(skill.invocations7d)}</span>
      </span>
    </button>
  );
}

function PillBtn({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`skill-filter-pill${active ? " is-active" : ""}`}
    >
      <span className="spf-label">{label}</span>
      <span className="spf-sep">·</span>
      <span className="spf-count">{count}</span>
    </button>
  );
}

function KindBadge({ kind }: { kind: "rigid" | "flexible" | "beta" }) {
  return <span className={`kind-badge kind-${kind}`}>{kind}</span>;
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
  return <>{fmtInt(display)}</>;
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
function pct(num: number, den: number): number { return den ? Math.round((num / den) * 100) : 0; }
