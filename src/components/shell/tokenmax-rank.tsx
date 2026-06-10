"use client";

import { useEffect, useRef, useState } from "react";
import { AsciiBar } from "./ascii-bar";

// Gamified "tokenmaxing" rank for today's spend, shown in the sidebar under the
// quota gauges. Today's notional cost (and total tokens) come from /api/metrics
// (summed across providers, UTC day), and the dollar figure picks a tier.

const TIERS = [
  { min: 0,   label: "AI NOOB",                     sub: "just warming up" },
  { min: 10,  label: "VIBE CODEUR",                 sub: "shipping vibes" },
  { min: 50,  label: "AI AGENTIC BUILDER",          sub: "orchestrating agents" },
  { min: 150, label: "MASTER OF AI AGENTIC AGENTS", sub: "tokenmaxing" },
] as const;

type Tier = (typeof TIERS)[number];

function tierFor(cost: number): { idx: number; cur: Tier; next: Tier | null; progress: number } {
  let idx = 0;
  for (let i = 0; i < TIERS.length; i += 1) {
    const t = TIERS[i];
    if (t && cost >= t.min) idx = i;
  }
  const cur = TIERS[idx]!;
  const next = idx + 1 < TIERS.length ? TIERS[idx + 1]! : null;
  const progress = next
    ? Math.min(100, Math.max(0, ((cost - cur.min) / (next.min - cur.min)) * 100))
    : 100;
  return { idx, cur, next, progress };
}

function fmtUsd(n: number): string {
  if (n >= 10_000) return `$${(n / 1_000).toFixed(0)}k`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  return `$${n.toFixed(2)}`;
}

function fmtTok(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return `${Math.round(n)}`;
}

// Smoothly count a number up to its new target whenever the data refreshes.
function useCountUp(target: number, ms = 700): number {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    const from = fromRef.current;
    if (from === target) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(from + (target - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return val;
}

interface MetricsRow {
  readonly daily?: Record<string, { c?: number; t?: number }>;
}

export function TokenmaxRank() {
  const [cost, setCost] = useState(0);
  const [tokens, setTokens] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        if (!alive || !res.ok) return;
        const j = (await res.json()) as { sessions?: readonly MetricsRow[] };
        const today = new Date().toISOString().slice(0, 10);
        let c = 0;
        let t = 0;
        for (const row of j.sessions ?? []) {
          const d = row.daily?.[today];
          if (d) { c += d.c ?? 0; t += d.t ?? 0; }
        }
        setCost(c);
        setTokens(t);
      } catch { /* ignore */ }
    };
    void load();
    const id = setInterval(load, 20_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const { idx, cur, next, progress } = tierFor(cost);
  const costAnim = useCountUp(cost);
  const tokAnim = useCountUp(tokens);

  return (
    <div className="tokenmax" data-tier={idx}>
      <div className="nav-label">Tokenmaxing · today</div>
      <div className="tmx-card">
        <div className="tmx-rank">{cur.label}</div>
        <div className="tmx-sub">{cur.sub}</div>
        <div className="tmx-stats">
          <span className="tmx-cost">{fmtUsd(costAnim)}</span>
          <span className="tmx-tok">{fmtTok(tokAnim)} tok</span>
        </div>
        <AsciiBar pct={progress} cells={22} />
        <div className="tmx-next">
          {next ? `${fmtUsd(next.min)} → ${next.label}` : "MAX TIER · keep tokenmaxing"}
        </div>
      </div>
    </div>
  );
}
