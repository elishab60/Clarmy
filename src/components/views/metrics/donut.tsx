"use client";

import { useState } from "react";
import type { Slice } from "./aggregate.ts";
import { colorAt, OTHER_COLOR } from "./palette.ts";

const SIZE = 168;
const STROKE = 20;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export function Donut({
  title,
  slices,
  total,
  format,
  centerLabel,
}: {
  title: string;
  slices: readonly Slice[];
  total: number;
  format: (n: number) => string;
  centerLabel: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const sum = slices.reduce((a, s) => a + s.value, 0) || 1;

  let acc = 0;
  const arcs = slices.map((s, i) => {
    const frac = s.value / sum;
    const color = s.key === "__other__" ? OTHER_COLOR : colorAt(i);
    const arc = { ...s, color, frac, offset: acc };
    acc += frac;
    return arc;
  });

  return (
    <div className="mx-donut-card">
      <div className="mx-card-h">{title}</div>
      <div className="mx-donut-body">
        <div className="mx-donut-ring" role="img" aria-label={`${title}: ${centerLabel}`}>
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {arcs.map((a) => {
                const dim = active !== null && active !== a.key;
                return (
                  <circle
                    key={a.key}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={R}
                    fill="none"
                    stroke={a.color}
                    strokeWidth={STROKE}
                    strokeDasharray={`${a.frac * C} ${C - a.frac * C}`}
                    strokeDashoffset={-a.offset * C}
                    style={{ opacity: dim ? 0.22 : 1, transition: "opacity .18s" }}
                    onMouseEnter={() => setActive(a.key)}
                    onMouseLeave={() => setActive(null)}
                  />
                );
              })}
            </g>
          </svg>
          <div className="mx-donut-center">
            {active ? (
              <>
                <span className="v">{format(arcs.find((a) => a.key === active)!.value)}</span>
                <span className="k">{Math.round((arcs.find((a) => a.key === active)!.frac) * 100)}% · {arcs.find((a) => a.key === active)!.label}</span>
              </>
            ) : (
              <>
                <span className="v">{centerLabel}</span>
                <span className="k">{slices.length} {slices.length === 1 ? "group" : "groups"}</span>
              </>
            )}
          </div>
        </div>
        <ul className="mx-legend">
          {arcs.map((a) => (
            <li
              key={a.key}
              className={active === a.key ? "on" : active ? "off" : ""}
              onMouseEnter={() => setActive(a.key)}
              onMouseLeave={() => setActive(null)}
            >
              <span className="dot" style={{ background: a.color }} />
              <span className="lbl" title={a.label}>{a.label}</span>
              <span className="val">{format(a.value)}</span>
              <span className="pct">{Math.round(a.frac * 100)}%</span>
            </li>
          ))}
          {arcs.length === 0 && <li className="empty">no data in range</li>}
        </ul>
      </div>
    </div>
  );
}
