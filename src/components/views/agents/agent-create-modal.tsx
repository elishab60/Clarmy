"use client";

import { useState } from "react";

const MODELS = ["inherit", "haiku", "sonnet", "opus"] as const;
type Model = typeof MODELS[number];

const DEFAULT_BODY = `You are a specialized subagent. Describe your behavior here.

## Responsibilities

- …

## Output

…`;

export function AgentCreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState<Model>("inherit");
  const [tools, setTools] = useState("");
  const [body, setBody] = useState(DEFAULT_BODY);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const nameOk = /^[a-zA-Z0-9_-]+$/.test(name);
  const canSubmit = nameOk && description.trim().length > 0 && body.trim().length > 0;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true); setErr(null);
    try {
      const r = await fetch("/api/agents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, description: description.trim(), model, tools: tools.trim() || undefined, body, scope: "user" }),
      });
      const j = await r.json() as { id?: string; error?: string };
      if (!r.ok || !j.id) { setErr(j.error ?? `${r.status}`); return; }
      onCreated(j.id);
    } catch (e) { setErr(String(e)); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal agent-create-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Create agent</h2>
          <button className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <div className="form-field">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. code-archaeologist"
              autoFocus
            />
            {!nameOk && name.length > 0 && <div className="field-err">Letters, digits, dashes and underscores only.</div>}
          </div>

          <div className="form-field">
            <label>Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="When should Claude delegate to this agent? Be specific — this is the trigger."
              rows={3}
            />
          </div>

          <div className="form-row">
            <div className="form-field">
              <label>Model</label>
              <select value={model} onChange={(e) => setModel(e.target.value as Model)}>
                {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-field" style={{ flex: 1 }}>
              <label>Tools <span className="field-hint">comma-separated, leave blank for all</span></label>
              <input value={tools} onChange={(e) => setTools(e.target.value)} placeholder="e.g. Read, Grep, Glob" />
            </div>
          </div>

          <div className="form-field">
            <label>System prompt</label>
            <textarea
              className="prompt-textarea"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              spellCheck={false}
            />
          </div>

          {err && <div className="field-err">Error: {err}</div>}
        </div>

        <div className="modal-foot">
          <span style={{ color: "var(--fg-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>saves to ~/.claude/agents/{name || "<name>"}.md</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button className="btn" onClick={onClose} disabled={submitting}>Cancel</button>
            <button className="btn primary" onClick={() => void submit()} disabled={!canSubmit || submitting}>{submitting ? "Creating…" : "Create agent"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
