"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import type { ProviderQuota, QuotaWindow, QuotasResponse } from "@/lib/shared/quota";

type Level = "ok" | "warn" | "crit";

function levelFor(pct: number | null): Level {
  if (pct === null) return "ok";
  if (pct >= 90) return "crit";
  if (pct >= 75) return "warn";
  return "ok";
}

function fmtReset(ms: number | null): string | null {
  if (ms === null) return null;
  const diff = ms - Date.now();
  if (diff <= 0) return "resets now";
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h < 24) return m > 0 ? `${h}h${m}m` : `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24}h`;
}

function Bar({ pct }: { pct: number | null }) {
  const style = { "--p": pct !== null ? pct / 100 : 0 } as CSSProperties;
  return (
    <div
      className="quota-bar"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === null ? undefined : Math.round(pct)}
      style={style}
    >
      <span className="quota-fill" data-level={levelFor(pct)} />
    </div>
  );
}

function WindowLine({ w }: { w: QuotaWindow }) {
  const reset = fmtReset(w.resetsAt);
  return (
    <div className="quota-wline" title={reset ? `${w.label} · resets in ${reset}` : w.label}>
      <span className="quota-wlabel">{w.label}</span>
      <Bar pct={w.usedPercent} />
      <span className="quota-wpct">{Math.round(w.usedPercent)}%</span>
    </div>
  );
}

function QuotaMeter({ q }: { q: ProviderQuota }) {
  const pct = q.usedPercent;
  const hasWindows = q.windows.length > 0;

  return (
    <div className="quota-row" data-state={q.state}>
      <div className="quota-head">
        <span className="quota-name">
          {q.label}
          {q.plan && <em>{q.plan}</em>}
        </span>
        <span className="quota-pct">{pct === null ? "—" : `${Math.round(pct)}%`}</span>
      </div>
      {hasWindows
        ? q.windows.map((w) => <WindowLine key={w.label} w={w} />)
        : <Bar pct={pct} />}
      {q.detail && !hasWindows && (
        <div className="quota-cap" title={q.detail}>{q.detail}</div>
      )}
    </div>
  );
}

export function QuotaMeters() {
  const [providers, setProviders] = useState<readonly ProviderQuota[]>([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/quotas", { cache: "no-store" });
        if (!alive || !res.ok) return;
        const j = (await res.json()) as QuotasResponse;
        if (alive) setProviders(j.providers ?? []);
      } catch { /* keep last good reading */ }
    };
    void load();
    const id = setInterval(load, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  if (providers.length === 0) return null;

  return (
    <div className="quota-group">
      <div className="nav-label">Quotas</div>
      {providers.map((q) => <QuotaMeter key={q.provider} q={q} />)}
    </div>
  );
}
