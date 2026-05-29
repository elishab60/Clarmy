"use client";

import { useEffect, useRef, useState } from "react";
import { fmtPct } from "./format.ts";

export interface StatDef {
  key: string;
  label: string;
  value: number;
  format: (n: number) => string;
  foot: string;
  delta?: number | null;
  deltaGood?: "up" | "down"; // which direction reads as positive
  accent?: boolean;
}

export function StatGrid({ stats, flashKey }: { stats: readonly StatDef[]; flashKey: number }) {
  return (
    <div className="mx-stat-grid">
      {stats.map((s, i) => (
        <StatCard key={s.key} def={s} flashKey={flashKey} index={i} />
      ))}
    </div>
  );
}

function StatCard({ def, flashKey, index }: { def: StatDef; flashKey: number; index: number }) {
  const good = def.deltaGood ?? "up";
  const d = def.delta ?? null;
  const dir = d == null ? 0 : d > 0.5 ? 1 : d < -0.5 ? -1 : 0;
  const positive = dir === 0 ? null : (dir > 0) === (good === "up");

  return (
    <div className={`mx-stat${def.accent ? " is-accent" : ""}`} style={{ animationDelay: `${index * 45}ms` }}>
      <div className="mx-stat-glow" />
      <div className="mx-stat-sheen" key={flashKey} />
      <div className="mx-stat-top">
        <span className="mx-stat-label">{def.label}</span>
        {d != null && dir !== 0 && (
          <span className={`mx-delta ${positive ? "up" : "down"}`} title="vs previous period">
            <Arrow up={dir > 0} />{fmtPct(d)}
          </span>
        )}
      </div>
      <div className="mx-stat-value"><AnimatedNumber value={def.value} format={def.format} /></div>
      <div className="mx-stat-foot">{def.foot}</div>
    </div>
  );
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden style={{ transform: up ? "none" : "scaleY(-1)" }}>
      <path d="M5 1.5 L8.5 6 L6.5 6 L6.5 8.5 L3.5 8.5 L3.5 6 L1.5 6 Z" fill="currentColor" />
    </svg>
  );
}

export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  useEffect(() => {
    const start = prevRef.current;
    const delta = value - start;
    if (Math.abs(delta) < 1e-9) { setDisplay(value); return; }
    const t0 = performance.now();
    const dur = 750;
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
  return <>{format(display)}</>;
}
