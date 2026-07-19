"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ApprovalMode, Effort, ModelId } from "@/lib/shared/types";
import { MODELS as MODEL_REGISTRY, ALL_EFFORTS } from "@/lib/shared/models";

type ScheduleKind = "recurring" | "oneshot";

const MODELS: { k: ModelId; label: string }[] = MODEL_REGISTRY.map((m) => ({
  k: m.id,
  label: `${m.label} (${m.tagline})`,
}));

const APPROVAL_MODES: { k: ApprovalMode; label: string }[] = [
  { k: "auto", label: "auto (full autonomy)" },
  { k: "prompt", label: "prompt (ask)" },
  { k: "strict", label: "strict" },
];

const EFFORTS: readonly Effort[] = ALL_EFFORTS;

const PRESETS: { label: string; expr: string }[] = [
  { label: "Every minute", expr: "* * * * *" },
  { label: "Every 5 minutes", expr: "*/5 * * * *" },
  { label: "Every 15 minutes", expr: "*/15 * * * *" },
  { label: "Every hour", expr: "0 * * * *" },
  { label: "Every day 09:00", expr: "0 9 * * *" },
  { label: "Weekdays 09:00", expr: "0 9 * * 1-5" },
  { label: "Every Monday 08:00", expr: "0 8 * * 1" },
  { label: "Every Sunday midnight", expr: "0 0 * * 0" },
  { label: "First of month 00:00", expr: "0 0 1 * *" },
];

const DEFAULT_PROMPT = `Review the codebase for anomalies or recent regressions.

Scan the repo, summarize changes in the last 24h, flag anything suspicious.

Report findings concisely.`;

export function CronCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<ScheduleKind>("recurring");
  const [expression, setExpression] = useState("*/15 * * * *");
  const [oneshotAt, setOneshotAt] = useState(() => defaultOneshotLocal());
  const [project, setProject] = useState("cron");
  const [cwd, setCwd] = useState("");
  const [sessionName, setSessionName] = useState("scheduled run");
  const [model, setModel] = useState<ModelId>("sonnet-5");
  const [effort, setEffort] = useState<Effort | "">("");
  const [approvalMode, setApprovalMode] = useState<ApprovalMode>("auto");
  const [dangerouslySkip, setDangerouslySkip] = useState(true);
  const [allowedTools, setAllowedTools] = useState("Read, Grep, Glob, Bash, Edit, Write");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [enabled, setEnabled] = useState(true);
  const [upcoming, setUpcoming] = useState<string[]>([]);
  const [cronErr, setCronErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  useEffect(() => {
    if (cwd === "") setCwd(typeof window !== "undefined" && window.location ? "~" : "~");
  }, [cwd]);

  const validateExpr = useCallback(async (expr: string) => {
    if (!expr.trim()) { setUpcoming([]); setCronErr(null); return; }
    try {
      const r = await fetch("/api/crons/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expression: expr, count: 5 }),
      });
      const j = (await r.json()) as { ok: boolean; upcoming?: string[]; error?: string };
      if (!j.ok) { setUpcoming([]); setCronErr(j.error ?? "invalid expression"); return; }
      setUpcoming(j.upcoming ?? []);
      setCronErr(null);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (kind !== "recurring") { setUpcoming([]); setCronErr(null); return; }
    const t = setTimeout(() => void validateExpr(expression), 250);
    return () => clearTimeout(t);
  }, [expression, kind, validateExpr]);

  const canSubmit = useMemo(() => {
    if (!name.trim() || !prompt.trim() || !cwd.trim() || !sessionName.trim() || !project.trim()) return false;
    if (kind === "recurring") return !!expression.trim() && !cronErr;
    return !!oneshotAt.trim();
  }, [name, prompt, cwd, sessionName, project, kind, expression, cronErr, oneshotAt]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setSubmitErr(null);
    try {
      const tools = allowedTools.split(",").map((s) => s.trim()).filter(Boolean);
      const schedule = kind === "recurring"
        ? { kind: "recurring" as const, expression: expression.trim() }
        : { kind: "oneshot" as const, at: new Date(oneshotAt).toISOString() };
      const body = {
        name: name.trim(),
        description: description.trim() || undefined,
        schedule,
        enabled,
        spawn: {
          project: project.trim(),
          cwd: cwd.trim(),
          name: sessionName.trim(),
          model,
          prompt: prompt.trim(),
          allowedTools: tools,
          approvalMode,
          dangerouslySkipPermissions: dangerouslySkip,
          effort: effort || undefined,
        },
      };
      const r = await fetch("/api/crons", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as { cron?: { id: string }; error?: string; message?: string };
      if (!r.ok || !j.cron) { setSubmitErr(j.message ?? j.error ?? `${r.status}`); return; }
      onCreated(j.cron.id);
    } catch (e) { setSubmitErr(String(e)); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal agent-create-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720 }}>
        <div className="modal-head">
          <h2>Create cron</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. nightly-repo-review" autoFocus />
          </div>

          <div className="form-field">
            <label>Description <span className="field-hint">optional</span></label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What does this cron do?" />
          </div>

          <div className="form-field">
            <label>Schedule</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              <button type="button" className={`btn${kind === "recurring" ? " primary" : ""}`} onClick={() => setKind("recurring")}>Recurring</button>
              <button type="button" className={`btn${kind === "oneshot" ? " primary" : ""}`} onClick={() => setKind("oneshot")}>One-shot</button>
            </div>
            {kind === "recurring" ? (
              <>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{ flex: 1, fontFamily: "var(--font-mono)" }}
                    value={expression}
                    onChange={(e) => setExpression(e.target.value)}
                    placeholder="m h dom mon dow  — e.g. 0 9 * * 1-5"
                  />
                  <select value="" onChange={(e) => { if (e.target.value) setExpression(e.target.value); }}>
                    <option value="">Preset…</option>
                    {PRESETS.map((p) => <option key={p.expr} value={p.expr}>{p.label}</option>)}
                  </select>
                </div>
                {cronErr && <div className="field-err" style={{ marginTop: 6 }}>{cronErr}</div>}
                {upcoming.length > 0 && (
                  <div style={{ marginTop: 8, padding: 10, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 11 }}>
                    <div style={{ color: "var(--fg-muted)", marginBottom: 6, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.06em" }}>Next 5 fires (local time)</div>
                    {upcoming.map((iso) => (
                      <div key={iso} style={{ color: "var(--fg-dim)" }}>{new Date(iso).toLocaleString()}</div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <input
                type="datetime-local"
                value={oneshotAt}
                onChange={(e) => setOneshotAt(e.target.value)}
              />
            )}
          </div>

          <div className="form-row">
            <div className="form-field" style={{ flex: 1 }}>
              <label>Project</label>
              <input value={project} onChange={(e) => setProject(e.target.value)} />
            </div>
            <div className="form-field" style={{ flex: 2 }}>
              <label>Cwd <span className="field-hint">absolute or ~ path</span></label>
              <input value={cwd} onChange={(e) => setCwd(e.target.value)} placeholder="~/code/my-repo" style={{ fontFamily: "var(--font-mono)" }} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field" style={{ flex: 2 }}>
              <label>Session name</label>
              <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} />
            </div>
            <div className="form-field">
              <label>Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value as ModelId)}>
                {MODELS.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Effort</label>
              <select value={effort} onChange={(e) => setEffort(e.target.value as Effort | "")}>
                <option value="">default</option>
                {EFFORTS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Approval</label>
              <select value={approvalMode} onChange={(e) => setApprovalMode(e.target.value as ApprovalMode)}>
                {APPROVAL_MODES.map((m) => <option key={m.k} value={m.k}>{m.label}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Allowed tools <span className="field-hint">comma-separated</span></label>
              <input value={allowedTools} onChange={(e) => setAllowedTools(e.target.value)} placeholder="Read, Grep, Bash, Edit, Write" style={{ fontFamily: "var(--font-mono)", fontSize: 11.5 }} />
            </div>
          </div>

          <div className="form-field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={dangerouslySkip} onChange={(e) => setDangerouslySkip(e.target.checked)} />
              <span>Dangerously skip permissions <span className="field-hint">bypass all approval prompts — true zero-human autonomy</span></span>
            </label>
          </div>

          <div className="form-field">
            <label>Prompt</label>
            <textarea
              className="prompt-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={8}
              spellCheck={false}
            />
          </div>

          <div className="form-field">
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span>Enabled on create</span>
            </label>
          </div>

          {submitErr && <div className="field-err">Error: {submitErr}</div>}
        </div>

        <div className="modal-foot">
          <span style={{ color: "var(--fg-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>stored in ~/.claude/cockpit/crons.json</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
            <button className="btn primary" onClick={() => void submit()} disabled={!canSubmit || submitting}>{submitting ? "Creating…" : "Create cron"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function defaultOneshotLocal(): string {
  const d = new Date(Date.now() + 5 * 60_000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
