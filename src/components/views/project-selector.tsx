"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface ProjectOption {
  id: string;
  name: string;
  cwd: string;
  branches: string[];
  sessions: number;
  lastRunAt?: number;
}

interface Props {
  projects: ProjectOption[];
  value: string;
  selected: ProjectOption | null;
  onPick: (p: ProjectOption) => void;
  onCustom: (name: string) => void;
}

export function ProjectSelector({ projects, value, selected, onPick, onCustom }: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 0);
    else setQ("");
  }, [open]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((p) =>
      p.name.toLowerCase().includes(needle) || p.cwd.toLowerCase().includes(needle),
    );
  }, [q, projects]);

  useEffect(() => { setActive(0); }, [q]);

  const commit = (p: ProjectOption) => {
    onPick(p);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active < filtered.length && filtered[active]) commit(filtered[active]!);
      else if (q.trim()) { onCustom(q.trim()); setOpen(false); }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="proj-select" ref={rootRef}>
      <button
        type="button"
        className={`proj-trigger ${open ? "open" : ""}`}
        onClick={() => setOpen((o) => !o)}
      >
        {selected ? (
          <span className="proj-trigger-body">
            <span className="proj-name">{selected.name}</span>
            <span className="proj-cwd">{selected.cwd}</span>
          </span>
        ) : value ? (
          <span className="proj-trigger-body">
            <span className="proj-name">{value}</span>
            <span className="proj-cwd proj-cwd-hint">custom — set project dir below</span>
          </span>
        ) : (
          <span className="proj-trigger-body">
            <span className="proj-placeholder">Choose a project…</span>
            <span className="proj-cwd proj-cwd-hint">
              {projects.length} available · or type a new one
            </span>
          </span>
        )}
        <span className="proj-caret">▾</span>
      </button>

      {open && (
        <div className="proj-dropdown" role="listbox">
          <input
            ref={inputRef}
            className="proj-search"
            placeholder="Filter by name or path…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
          />
          <div className="proj-list">
            {filtered.length === 0 && (
              <div className="proj-empty">
                No match. {q.trim() && (
                  <button
                    type="button"
                    className="proj-create"
                    onClick={() => { onCustom(q.trim()); setOpen(false); }}
                  >
                    Use "{q.trim()}" as custom project
                  </button>
                )}
              </div>
            )}
            {filtered.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={i === active}
                className={`proj-item ${i === active ? "active" : ""} ${selected?.id === p.id ? "selected" : ""}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => commit(p)}
              >
                <span className="proj-item-head">
                  <span className="proj-item-name">{p.name}</span>
                  <span className="proj-item-meta">
                    {p.sessions > 0 && <span>{p.sessions} session{p.sessions > 1 ? "s" : ""}</span>}
                    {p.lastRunAt ? <span>· {fmtRel(p.lastRunAt)}</span> : null}
                  </span>
                </span>
                <span className="proj-item-cwd">{p.cwd}</span>
                {p.branches.length > 0 && (
                  <span className="proj-item-branches">
                    {p.branches.slice(0, 3).map((b) => (
                      <span key={b} className="proj-branch">⎇ {b}</span>
                    ))}
                    {p.branches.length > 3 && <span className="proj-branch">+{p.branches.length - 3}</span>}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="proj-foot">
            <span>↑↓ navigate · ↵ select · esc close</span>
            <a href="/projects">Manage projects →</a>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtRel(t: number): string {
  if (!t) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
