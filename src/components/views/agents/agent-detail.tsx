"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { AgentRow } from "../agents-page";

const labelCell: CSSProperties = {
  fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em",
  color: "var(--fg-muted)", whiteSpace: "nowrap", paddingTop: 2,
};
const valueCell: CSSProperties = { fontSize: 13, color: "var(--fg)", lineHeight: 1.5 };
const monoValue: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-muted)",
  lineHeight: 1.5, wordBreak: "break-all", overflowWrap: "anywhere",
};

export function AgentDetail({ agent, onChange, onDeleted }: { agent: AgentRow; onChange: () => void; onDeleted: () => void }) {
  const [body, setBody] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const loadBody = useCallback(async () => {
    setBody(null); setDraft(null); setEditing(false); setLoadErr(null);
    if (agent.source === "builtin") { setBody(""); return; }
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agent.id)}/body`, { cache: "no-store" });
      const j = (await r.json()) as { body?: string; error?: string };
      if (!r.ok) { setLoadErr(j.error ?? "failed to load"); return; }
      setBody(j.body ?? "");
    } catch (e) { setLoadErr(String(e)); }
  }, [agent.id, agent.source]);

  useEffect(() => { void loadBody(); }, [loadBody]);

  const startEdit = () => {
    if (!agent.editable || body == null) return;
    setDraft(body);
    setEditing(true);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const cancel = () => { setEditing(false); setDraft(null); };

  const save = async () => {
    if (draft == null) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      if (!r.ok) { const j = await r.json() as { error?: string }; setLoadErr(j.error ?? `${r.status}`); return; }
      setBody(draft); setEditing(false); setDraft(null);
      onChange();
    } finally { setSaving(false); }
  };

  const del = async () => {
    if (!agent.editable) return;
    if (!confirm(`Delete agent "${agent.name}"? This removes the file from disk.`)) return;
    const r = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, { method: "DELETE" });
    if (r.ok) onDeleted();
    else { const j = await r.json() as { error?: string }; setLoadErr(j.error ?? `${r.status}`); }
  };

  const dirty = editing && draft !== body;

  return (
    <div className="mcp-detail">
      <div className="row-h">
        <h2 title={agent.name}>{agent.name}</h2>
        <span className="id">{sourceLabel(agent)}</span>
        <ModelPill model={agent.model} />
        <div className="right-actions" style={{ alignItems: "center", gap: 8 }}>
          {agent.editable && !editing && <button className="btn" onClick={startEdit} disabled={body == null}>Edit</button>}
          {agent.editable && editing && (
            <>
              <button className="btn" onClick={cancel} disabled={saving}>Cancel</button>
              <button className="btn primary" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save"}</button>
            </>
          )}
          {agent.editable && !editing && <button className="btn ghost" onClick={del} style={{ color: "var(--state-error)" }}>Delete</button>}
        </div>
      </div>

      <p style={{ margin: "0 0 22px", color: "var(--fg)", fontSize: 14, lineHeight: 1.65 }}>{agent.description}</p>

      <div className="field-grid">
        <div style={labelCell}>Source</div>
        <div style={valueCell}>
          <SourceBadge source={agent.source} />
          {agent.plugin && <span style={{ marginLeft: 8, color: "var(--fg-muted)", fontFamily: "var(--font-mono)", fontSize: 11 }}>{agent.plugin}{agent.marketplace ? ` @ ${agent.marketplace}` : ""}</span>}
        </div>
        <div style={labelCell}>Model</div>
        <div style={valueCell}>{agent.model}</div>
        {agent.tools && (<>
          <div style={labelCell}>Tools</div>
          <div style={{ ...valueCell, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--fg-dim)" }}>{agent.tools}</div>
        </>)}
        {agent.path && (<>
          <div style={labelCell}>Path</div>
          <div style={monoValue} title={agent.path}>{agent.path}</div>
        </>)}
      </div>

      {loadErr && <div style={{ color: "var(--state-error)", fontSize: 12, marginTop: 12 }}>Error: {loadErr}</div>}

      <h3 className="metric-h" style={{ marginTop: 24 }}>System prompt</h3>

      {agent.source === "builtin" && (
        <div className="mcp-empty" style={{ padding: "18px 12px" }}>
          Built-in agent — prompt lives in the Claude Code binary and is not exposed.
        </div>
      )}

      {agent.source !== "builtin" && body != null && !editing && (
        <pre className="agent-body-view">{body}</pre>
      )}

      {editing && draft != null && (
        <textarea
          ref={taRef}
          className="agent-body-edit"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
        />
      )}

      {agent.source !== "builtin" && body == null && !loadErr && (
        <div className="mcp-empty" style={{ padding: 12 }}>Loading…</div>
      )}
    </div>
  );
}

function sourceLabel(a: AgentRow): string {
  if (a.source === "user") return "user";
  if (a.source === "project") return "project";
  if (a.source === "builtin") return "built-in";
  return a.plugin ? `plugin:${a.plugin}` : "plugin";
}

function SourceBadge({ source }: { source: AgentRow["source"] }) {
  return <span className={`source-badge source-${source}`}>{source}</span>;
}

function ModelPill({ model }: { model: string }) {
  const m = model.toLowerCase();
  const tone = m === "opus" ? "opus" : m === "sonnet" ? "sonnet" : m === "haiku" ? "haiku" : "inherit";
  return <span className={`model-badge tone-${tone}`}>{model}</span>;
}
