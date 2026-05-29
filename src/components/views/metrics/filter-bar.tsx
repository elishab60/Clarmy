"use client";

import { useEffect, useRef, useState } from "react";
import type { RangeKey } from "./types.ts";

const RANGES: { k: RangeKey; label: string }[] = [
  { k: "7d", label: "7d" },
  { k: "30d", label: "30d" },
  { k: "90d", label: "90d" },
  { k: "1y", label: "1y" },
  { k: "all", label: "All" },
];

export interface Opt {
  key: string;
  label: string;
  sub?: string;
}

export function FilterBar({
  range,
  onRange,
  projectOpts,
  selectedProjects,
  onProjects,
  modelOpts,
  selectedModels,
  onModels,
  spanLabel,
  onClear,
}: {
  range: RangeKey;
  onRange: (r: RangeKey) => void;
  projectOpts: readonly Opt[];
  selectedProjects: readonly string[];
  onProjects: (v: string[]) => void;
  modelOpts: readonly Opt[];
  selectedModels: readonly string[];
  onModels: (v: string[]) => void;
  spanLabel: string;
  onClear: () => void;
}) {
  const dirty = selectedProjects.length > 0 || selectedModels.length > 0 || range !== "all";
  return (
    <div className="mx-filters">
      <div className="mx-seg" role="radiogroup" aria-label="Time range">
        {RANGES.map((r) => (
          <button key={r.k} role="radio" aria-checked={range === r.k} className={range === r.k ? "on" : ""} onClick={() => onRange(r.k)}>
            {r.label}
          </button>
        ))}
      </div>
      <MultiSelect label="Projects" options={projectOpts} selected={selectedProjects} onChange={onProjects} searchable />
      <MultiSelect label="Models" options={modelOpts} selected={selectedModels} onChange={onModels} />
      <span className="mx-span" title="data range">{spanLabel}</span>
      {dirty && <button className="mx-clear" onClick={onClear}>clear</button>}
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable = false,
}: {
  label: string;
  options: readonly Opt[];
  selected: readonly string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const toggle = (k: string) => {
    onChange(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  };
  const sel = new Set(selected);
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()) || o.sub?.toLowerCase().includes(q.toLowerCase())) : options;

  return (
    <div className="mx-ms" ref={ref}>
      <button className={`mx-ms-btn${selected.length ? " on" : ""}`} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{label}</span>
        {selected.length > 0 && <span className="mx-ms-count">{selected.length}</span>}
        <Chevron open={open} />
      </button>
      {open && (
        <div className="mx-ms-pop">
          {searchable && (
            <input className="mx-ms-search" autoFocus placeholder="filter…" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="mx-ms-list">
            {filtered.map((o) => (
              <label key={o.key} className={`mx-ms-row${sel.has(o.key) ? " on" : ""}`}>
                <input type="checkbox" checked={sel.has(o.key)} onChange={() => toggle(o.key)} />
                <span className="mx-ms-lbl">
                  <span className="t" title={o.label}>{o.label}</span>
                  {o.sub && <span className="s" title={o.sub}>{o.sub}</span>}
                </span>
              </label>
            ))}
            {filtered.length === 0 && <div className="mx-ms-empty">no match</div>}
          </div>
          {selected.length > 0 && (
            <button className="mx-ms-clear" onClick={() => onChange([])}>clear {label.toLowerCase()}</button>
          )}
        </div>
      )}
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .18s" }}>
      <path d="M3 4.5 L6 7.5 L9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
