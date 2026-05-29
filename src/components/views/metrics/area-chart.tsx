"use client";

import { useRef, useState } from "react";

export interface SeriesPoint {
  t: number;
  label: string;
  value: number;
}

const H = 200;
const PAD_T = 14;
const PAD_B = 22;
const PAD_L = 4;
const PAD_R = 4;
const PLOT_H = H - PAD_T - PAD_B;

// Width-responsive area+line chart. The internal coordinate width is fixed at
// VW; the SVG scales to the container via width="100%". Hover maps the pointer
// to the nearest sample using the container's measured width.
const VW = 1000;

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / mag;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * mag;
}

export function AreaChart({
  points,
  format,
  unit,
}: {
  points: readonly SeriesPoint[];
  format: (n: number) => string;
  unit: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [hi, setHi] = useState<number | null>(null);

  const n = points.length;
  if (n === 0) return <div className="mx-area-empty">no activity in range</div>;

  const max = niceMax(Math.max(...points.map((p) => p.value)));
  const innerW = VW - PAD_L - PAD_R;
  const x = (i: number) => PAD_L + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD_T + PLOT_H - (v / max) * PLOT_H;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(n - 1).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} L${x(0).toFixed(1)} ${(PAD_T + PLOT_H).toFixed(1)} Z`;

  const gridVals = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const labelEvery = Math.max(1, Math.ceil(n / 8));

  const onMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    setHi(Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1)))));
  };

  const hp = hi != null ? points[hi] : null;

  return (
    <div className="mx-area" ref={ref} onMouseMove={onMove} onMouseLeave={() => setHi(null)}>
      <svg viewBox={`0 0 ${VW} ${H}`} preserveAspectRatio="none" className="mx-area-svg" role="img" aria-label="Activity over time">
        <defs>
          <linearGradient id="mx-area-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.32" />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridVals.map((v, i) => (
          <line key={i} x1={PAD_L} x2={VW - PAD_R} y1={y(v)} y2={y(v)} className="mx-area-grid" />
        ))}
        <path d={area} fill="url(#mx-area-grad)" />
        <path d={line} className="mx-area-line" fill="none" vectorEffect="non-scaling-stroke" />
        {hp && (
          <line x1={x(hi!)} x2={x(hi!)} y1={PAD_T} y2={PAD_T + PLOT_H} className="mx-area-cross" vectorEffect="non-scaling-stroke" />
        )}
        {hp && <circle cx={x(hi!)} cy={y(hp.value)} r={3.5} className="mx-area-dot" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mx-area-yaxis">
        {[...gridVals].reverse().map((v, i) => <span key={i}>{format(v)}</span>)}
      </div>
      <div className="mx-area-xaxis">
        {points.map((p, i) => (i % labelEvery === 0 || i === n - 1) ? <span key={p.t} style={{ left: `${(x(i) / VW) * 100}%` }}>{p.label}</span> : null)}
      </div>
      {hp && (
        <div className="mx-area-tip" style={{ left: `${(x(hi!) / VW) * 100}%` }}>
          <span className="d">{hp.label}</span>
          <span className="v">{format(hp.value)} {unit}</span>
        </div>
      )}
    </div>
  );
}
