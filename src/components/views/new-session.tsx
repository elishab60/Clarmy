"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ApprovalMode, ModelId } from "@/lib/shared/types";
import { ProjectSelector, type ProjectOption } from "./project-selector";

const MODELS: ModelId[] = ["opus-4.7", "sonnet-4.6", "haiku-4.5"];
const DEFAULT_TOOLS = ["Bash", "Read", "Edit", "Write", "Grep", "Glob", "WebFetch", "WebSearch", "TodoWrite", "Task"];
const INITIAL_TOOLS = ["Bash", "Read", "Edit", "Write", "Grep", "TodoWrite"];

export function NewSessionView() {
  const router = useRouter();
  const search = useSearchParams();
  const initialCwd = search.get("cwd") ?? "";
  const initialPrompt = search.get("prompt") ?? "";
  const autolaunch = search.get("autolaunch") === "1";
  const [model, setModel] = useState<ModelId>("opus-4.7");
  const [tools, setTools] = useState<string[]>(INITIAL_TOOLS);
  const [project, setProject] = useState("");
  const [cwd, setCwd] = useState(initialCwd);
  const [name, setName] = useState("");
  const [branch, setBranch] = useState("main");
  const [approval, setApproval] = useState<ApprovalMode>("prompt");
  const [autoMode, setAutoMode] = useState(false);
  const [skipPerms, setSkipPerms] = useState(false);
  const [prompt, setPrompt] = useState(initialPrompt);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [customBranch, setCustomBranch] = useState(false);
  const [gitBranches, setGitBranches] = useState<string[]>([]);
  const [gitCurrent, setGitCurrent] = useState<string | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitReason, setGitReason] = useState<string | null>(null);
  const [pendingLaunch, setPendingLaunch] = useState(autolaunch && Boolean(initialPrompt));

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/projects", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { projects: ProjectOption[] };
        const sorted = j.projects.slice().sort((a, b) => {
          const la = a.lastRunAt ?? 0;
          const lb = b.lastRunAt ?? 0;
          if (lb !== la) return lb - la;
          return b.sessions - a.sessions;
        });
        setProjects(sorted);
        if (initialCwd) {
          const match = sorted.find((p) => p.cwd === initialCwd);
          if (match) {
            setProject(match.name);
            setBranch(match.branches[0] ?? "main");
          }
        } else if (!project && sorted[0]) {
          setProject(sorted[0].name);
          setCwd(sorted[0].cwd);
          setBranch(sorted[0].branches[0] ?? "main");
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const selected = useMemo<ProjectOption | null>(
    () => projects.find((p) => p.name === project && p.cwd === cwd) ?? null,
    [projects, project, cwd],
  );

  useEffect(() => {
    if (!cwd) { setGitBranches([]); setGitCurrent(null); setGitReason(null); return; }
    const ac = new AbortController();
    setGitLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/git/branches?cwd=${encodeURIComponent(cwd)}`, { signal: ac.signal });
        if (!res.ok) return;
        const j = (await res.json()) as {
          branches: { name: string; lastCommitAt: number }[];
          current: string | null;
          reason?: string;
        };
        setGitBranches(j.branches.map((b) => b.name));
        setGitCurrent(j.current);
        setGitReason(j.reason ?? null);
        if (j.current && !customBranch) setBranch(j.current);
      } catch { /* aborted */ }
      finally { setGitLoading(false); }
    })();
    return () => ac.abort();
  }, [cwd]);

  const onPick = (p: ProjectOption) => {
    setProject(p.name);
    setCwd(p.cwd);
    setBranch(p.branches[0] ?? "main");
    setCustomBranch(false);
  };

  const onCustom = (name: string) => {
    setProject(name);
    setCwd("");
    setBranch("main");
    setCustomBranch(false);
  };

  const branchOptions = useMemo(() => {
    const set = new Set<string>();
    for (const b of gitBranches) set.add(b);
    for (const b of selected?.branches ?? []) set.add(b);
    return Array.from(set);
  }, [gitBranches, selected]);

  const toggle = (t: string) => setTools((xs) => xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]);

  const submit = async () => {
    if (!project.trim() || !cwd.trim() || !prompt.trim()) {
      setErr("Project, cwd and prompt are required.");
      return;
    }
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project, cwd, name: name || prompt.split("\n")[0]!.slice(0, 60), model,
          allowedTools: tools,
          approvalMode: skipPerms ? "auto" : autoMode ? "auto" : approval,
          dangerouslySkipPermissions: skipPerms,
          branch, prompt,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({ error: "unknown" }));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.push("/");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
      setPendingLaunch(false);
    }
  };

  useEffect(() => {
    if (!pendingLaunch) return;
    if (!project.trim() || !cwd.trim() || !prompt.trim()) return;
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPendingLaunch(false);
    };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => { void submit(); }, 500);
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey); };
  }, [pendingLaunch, project, cwd, prompt, busy]);

  return (
    <div className="new-session-view">
      <h1>New session</h1>
      <p className="lede">Spawn a Claude Code session in a project directory. You can approve tool calls individually or let a set of them run unattended.</p>

      <div className="form-card">
        <div className="form-section">
          <h4>Workspace</h4>
          <div className="form-row">
            <label>Project</label>
            <div className="ctrl">
              <ProjectSelector
                projects={projects}
                value={project}
                selected={selected}
                onPick={onPick}
                onCustom={onCustom}
              />
              {projects.length === 0 && (
                <div className="hint" style={{ fontSize: 10.5, color: "var(--fg-muted)", marginTop: 6 }}>
                  No saved projects yet — create a custom one, or add it in <a href="/projects" style={{ color: "var(--brand)" }}>Projects</a>.
                </div>
              )}
            </div>
          </div>
          <div className="form-row">
            <label>Project dir</label>
            <div className="ctrl">
              <input
                value={cwd}
                onChange={(e) => setCwd(e.target.value)}
                placeholder="/Users/me/code/acme-api"
              />
            </div>
          </div>
          <div className="form-row">
            <label>Branch</label>
            <div className="ctrl">
              {branchOptions.length > 0 && !customBranch ? (
                <div className="branch-picker">
                  {branchOptions.map((b) => (
                    <button
                      key={b}
                      type="button"
                      className={`${branch === b ? "on" : ""} ${b === gitCurrent ? "current" : ""}`}
                      onClick={() => setBranch(b)}
                      title={b === gitCurrent ? "current branch (git HEAD)" : undefined}
                    >⎇ {b}{b === gitCurrent ? " ·" : ""}</button>
                  ))}
                  <button
                    type="button"
                    className="branch-custom"
                    onClick={() => setCustomBranch(true)}
                  >+ custom</button>
                </div>
              ) : (
                <input
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  onBlur={() => { if (branchOptions.includes(branch)) setCustomBranch(false); }}
                />
              )}
              <div className="branch-hint">
                {gitLoading && <span>reading git…</span>}
                {!gitLoading && gitReason === "not-a-repo" && <span>not a git repo — type a name above</span>}
                {!gitLoading && gitReason === "missing" && <span>cwd not found</span>}
                {!gitLoading && !gitReason && gitBranches.length > 0 && (
                  <span>{gitBranches.length} live branch{gitBranches.length > 1 ? "es" : ""} · <span className="dot">·</span> = current</span>
                )}
              </div>
            </div>
          </div>
          <div className="form-row">
            <label>Session name</label>
            <div className="ctrl"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="refactor auth middleware" /></div>
          </div>
        </div>

        <div className="form-section">
          <h4>Model</h4>
          <div className="form-row">
            <label>Model</label>
            <div className="ctrl">
              <div className="model-picker">
                {MODELS.map((m) => (
                  <button key={m} className={model === m ? "on" : ""} onClick={() => setModel(m)}>{m}</button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Allowed tools</h4>
          <div className="form-row">
            <label>Built-in</label>
            <div className="ctrl">
              <div className="tool-chips">
                {DEFAULT_TOOLS.map((t) => (
                  <button key={t} className={`chip ${tools.includes(t) ? "on" : ""}`} onClick={() => toggle(t)}>{t}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="form-row">
            <label>Approval</label>
            <div className="ctrl">
              <select
                value={approval}
                onChange={(e) => setApproval(e.target.value as ApprovalMode)}
                disabled={autoMode || skipPerms}
                style={autoMode || skipPerms ? { opacity: 0.5 } : undefined}
              >
                <option value="prompt">prompt — ask before destructive tools</option>
                <option value="strict">strict — ask for every tool call</option>
                <option value="auto">auto — run all tools without asking</option>
              </select>
            </div>
          </div>
          <div className="form-row">
            <label>Auto mode</label>
            <div className="ctrl">
              <label className={`toggle-row ${skipPerms ? "disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={autoMode}
                  disabled={skipPerms}
                  onChange={(e) => setAutoMode(e.target.checked)}
                  style={{ accentColor: "var(--brand)" }}
                />
                <span className="toggle-text">
                  <span className="toggle-title">Accept every tool call</span>
                  <span className="toggle-desc">equivalent to <code>--permission-mode acceptEdits</code></span>
                </span>
              </label>
            </div>
          </div>
          <div className="form-row">
            <label className={skipPerms ? "label-danger" : undefined}>Skip perms</label>
            <div className="ctrl">
              <label className={`toggle-row ${skipPerms ? "danger" : ""}`}>
                <input
                  type="checkbox"
                  checked={skipPerms}
                  onChange={(e) => setSkipPerms(e.target.checked)}
                  style={{ accentColor: "var(--state-error)" }}
                />
                <span className="toggle-text">
                  <span className="toggle-title toggle-danger">⚠ dangerously-skip-permissions</span>
                  <span className="toggle-desc">bypass all permission checks — use only in sandboxed envs</span>
                </span>
              </label>
              {skipPerms && (
                <div className="danger-banner">
                  Runs with <code>--dangerously-skip-permissions</code>. <code>rm -rf</code>, <code>git push --force</code>, and network calls run without asking.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="form-section">
          <h4>Initial prompt</h4>
          <div className="form-row">
            <label>Prompt</label>
            <div className="ctrl">
              <textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-foot">
          <span className="hint">
            {err ? <span style={{ color: "var(--state-error)" }}>{err}</span>
             : pendingLaunch ? <span style={{ color: "var(--brand)" }}>auto-launching… press esc to cancel</span>
             : "⌘↵ to launch · esc to cancel"}
          </span>
          <button className="btn ghost" onClick={() => { setPendingLaunch(false); router.push("/"); }}>Cancel</button>
          <button className="btn primary" disabled={busy} onClick={submit}>{busy ? "Launching…" : "Launch session"}</button>
        </div>
      </div>
    </div>
  );
}
