"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { CronJob } from "@/lib/shared/cron-types";
import { relativeFromNow } from "../crons-page";

const labelCell: CSSProperties = {
  fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "var(--fg-muted)", whiteSpace: "nowrap", paddingTop: 2,
};
const valueCell: CSSProperties = { fontSize: 13, color: "var(--fg)", lineHeight: 1.5 };
const monoValue: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)",
  lineHeight: 1.5, wordBreak: "break-all", overflowWrap: "anywhere",
};

export function CronDetail({ cron, now, onChange, onDeleted }: { cron: CronJob; now: number; onChange: () => void; onDeleted: () => void }) {
  const [upcoming, setUpcoming] = useState<string[]>([]);
  const [busy, setBusy] = useState<null | "toggle" | "run" | "delete">(null);
  const [err, setErr] = useState<string | null>(null);

  const loadUpcoming = useCallback(async () => {
    if (cron.schedule.kind !== "recurring") { setUpcoming([]); return; }
    try {
      const r = await fetch("/api/crons/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expression: cron.schedule.expression, count: 5 }),
      });
      const j = (await r.json()) as { ok?: boolean; upcoming?: string[] };
      setUpcoming(j.upcoming ?? []);
    } catch { setUpcoming([]); }
  }, [cron.schedule]);

  useEffect(() => { void loadUpcoming(); }, [loadUpcoming]);

  const toggle = async () => {
    setBusy("toggle"); setErr(null);
    try {
      const r = await fetch(`/api/crons/${cron.id}/toggle`, { method: "POST" });
      if (!r.ok) throw new Error(`${r.status}`);
      onChange();
    } catch (e) { setErr(String(e)); } finally { setBusy(null); }
  };

  const runNow = async () => {
    setBusy("run"); setErr(null);
    try {
      const r = await fetch(`/api/crons/${cron.id}/run`, { method: "POST" });
      const j = await r.json() as { ok?: boolean; sessionId?: string; error?: string };
      if (!r.ok || !j.ok) { setErr(j.error ?? `${r.status}`); return; }
      onChange();
    } catch (e) { setErr(String(e)); } finally { setBusy(null); }
  };

  const del = async () => {
    if (!confirm(`Delete cron "${cron.name}"?`)) return;
    setBusy("delete"); setErr(null);
    try {
      const r = await fetch(`/api/crons/${cron.id}`, { method: "DELETE" });
      if (r.ok) onDeleted();
      else { const j = await r.json() as { error?: string }; setErr(j.error ?? `${r.status}`); }
    } finally { setBusy(null); }
  };

  const scheduleLabel = cron.schedule.kind === "recurring" ? cron.schedule.expression : new Date(cron.schedule.at).toLocaleString();
  const modelTone = cron.spawn.model.startsWith("opus") ? "opus" : cron.spawn.model.startsWith("sonnet") ? "sonnet" : "haiku";

  return (
    <div className="mcp-detail">
      <div className="row-h">
        <h2 title={cron.name}>{cron.name}</h2>
        <span className="id">{cron.schedule.kind}</span>
        <span className={`model-badge tone-${modelTone}`}>{cron.spawn.model}</span>
        <div className="right-actions" style={{ alignItems: "center", gap: 8 }}>
          <button className="btn" onClick={() => void runNow()} disabled={busy !== null}>{busy === "run" ? "Spawning…" : "Run now"}</button>
          <button className="btn" onClick={() => void toggle()} disabled={busy !== null}>{busy === "toggle" ? "…" : cron.enabled ? "Pause" : "Enable"}</button>
          <button className="btn ghost" onClick={() => void del()} disabled={busy !== null} style={{ color: "var(--state-error)" }}>Delete</button>
        </div>
      </div>

      {cron.description && <p style={{ margin: "0 0 22px", color: "var(--fg)", fontSize: 14, lineHeight: 1.65 }}>{cron.description}</p>}

      <div className="field-grid">
        <div style={labelCell}>Status</div>
        <div style={valueCell}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cron.enabled ? "#10b981" : "var(--fg-muted)" }} />
            {cron.enabled ? "Enabled" : "Paused"}
          </span>
        </div>

        <div style={labelCell}>Schedule</div>
        <div style={{ ...valueCell, fontFamily: "var(--font-mono)" }}>{scheduleLabel}</div>

        <div style={labelCell}>Next fire</div>
        <div style={valueCell}>
          {cron.enabled && cron.nextFireAt
            ? <span>{new Date(cron.nextFireAt).toLocaleString()} <span style={{ color: "var(--fg-muted)", marginLeft: 8 }}>({relativeFromNow(new Date(cron.nextFireAt).getTime(), now)})</span></span>
            : <span style={{ color: "var(--fg-muted)" }}>—</span>}
        </div>

        <div style={labelCell}>Last fire</div>
        <div style={valueCell}>
          {cron.lastRun
            ? <span>{new Date(cron.lastRun.at).toLocaleString()} · <span style={{ color: cron.lastRun.status === "spawned" ? "#10b981" : "var(--state-error)" }}>{cron.lastRun.status}</span>{cron.lastRun.sessionId && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)", marginLeft: 8 }}>{cron.lastRun.sessionId}</span>}</span>
            : <span style={{ color: "var(--fg-muted)" }}>never</span>}
          {cron.lastRun?.error && <div style={{ color: "var(--state-error)", fontSize: 11, marginTop: 4, fontFamily: "var(--font-mono)" }}>{cron.lastRun.error}</div>}
        </div>

        <div style={labelCell}>Runs</div>
        <div style={valueCell}>{cron.runCount}</div>

        <div style={labelCell}>Project</div>
        <div style={valueCell}>{cron.spawn.project}</div>

        <div style={labelCell}>Cwd</div>
        <div style={monoValue}>{cron.spawn.cwd}</div>

        <div style={labelCell}>Session name</div>
        <div style={valueCell}>{cron.spawn.name}</div>

        <div style={labelCell}>Approval</div>
        <div style={valueCell}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{cron.spawn.approvalMode}</span>
          {cron.spawn.dangerouslySkipPermissions && <span style={{ marginLeft: 10, color: "#f59e0b", fontSize: 11 }}>bypass-permissions</span>}
        </div>

        {cron.spawn.effort && (<>
          <div style={labelCell}>Effort</div>
          <div style={{ ...valueCell, fontFamily: "var(--font-mono)", fontSize: 11 }}>{cron.spawn.effort}</div>
        </>)}

        {cron.spawn.allowedTools.length > 0 && (<>
          <div style={labelCell}>Tools</div>
          <div style={{ ...valueCell, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-dim)" }}>{cron.spawn.allowedTools.join(", ")}</div>
        </>)}
      </div>

      {err && <div style={{ color: "var(--state-error)", fontSize: 12, marginTop: 12 }}>Error: {err}</div>}

      <h3 className="metric-h" style={{ marginTop: 24 }}>Prompt</h3>
      <pre style={{
        background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, padding: 12,
        fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg)", whiteSpace: "pre-wrap",
        wordBreak: "break-word", maxHeight: 260, overflow: "auto", margin: 0,
      }}>{cron.spawn.prompt}</pre>

      {cron.schedule.kind === "recurring" && upcoming.length > 0 && (
        <>
          <h3 className="metric-h" style={{ marginTop: 24 }}>Upcoming fires</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {upcoming.map((iso, i) => (
              <div key={iso} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: i === 0 ? "color-mix(in srgb, var(--brand) 8%, var(--bg))" : "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11.5 }}>
                <span>{new Date(iso).toLocaleString()}</span>
                <span style={{ color: "var(--fg-muted)" }}>{relativeFromNow(new Date(iso).getTime(), now)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
