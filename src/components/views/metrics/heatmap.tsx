"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DayBucket, HeatMetric } from "./types.ts";
import { fmtCostFull, fmtDay, fmtInt, fmtTokens } from "./format.ts";

const GAP = 3;
const TOP = 18;
const LEFT = 26;
const MIN_STEP = 10;
const MAX_STEP = 24;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["", "Mon", "", "Wed", "", "Fri", ""];

function keyUTC(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function weekday(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}
function valueOf(b: DayBucket | undefined, metric: HeatMetric): number {
  if (!b) return 0;
  return metric === "sessions" ? b.sessions : metric === "cost" ? b.cost : b.output;
}
function fmtMetric(v: number, metric: HeatMetric): string {
  return metric === "cost" ? fmtCostFull(v) : metric === "output" ? `${fmtTokens(v)} output tok` : `${fmtInt(v)} session${v === 1 ? "" : "s"}`;
}

export function Heatmap({ bucket, metric, from, to }: { bucket: Map<string, DayBucket>; metric: HeatMetric; from: number; to: number }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(720);
  const [mounted, setMounted] = useState(false);
  const [hover, setHover] = useState<{ x: number; y: number; key: string; v: number } | null>(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { weeks, thresholds, monthLabels } = useMemo(() => {
    const startKey = keyUTC(from);
    const start = addDays(startKey, -weekday(startKey)); // back to Sunday
    const endKey = keyUTC(to);
    const days: string[] = [];
    let cur = start;
    for (let i = 0; i < 800 && cur <= endKey; i++) { days.push(cur); cur = addDays(cur, 1); }
    const weeks: string[][] = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

    const nonzero = days.map((k) => valueOf(bucket.get(k), metric)).filter((v) => v > 0).sort((a, b) => a - b);
    const q = (p: number) => (nonzero.length ? nonzero[Math.min(nonzero.length - 1, Math.floor(p * nonzero.length))]! : 0);
    const thresholds = [q(0.25), q(0.5), q(0.75), q(0.9)];

    const monthLabels: { col: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((w, col) => {
      const first = w[0];
      if (!first) return;
      const mo = Number(first.slice(5, 7)) - 1;
      if (mo !== lastMonth) { monthLabels.push({ col, label: MONTHS[mo]! }); lastMonth = mo; }
    });
    return { weeks, thresholds, monthLabels };
  }, [bucket, metric, from, to]);

  // Cells scale to fill the available width, capped so short ranges stay tidy.
  const step = Math.max(MIN_STEP, Math.min(MAX_STEP, Math.floor((width - LEFT) / Math.max(1, weeks.length))));
  const cell = step - GAP;
  const svgW = LEFT + weeks.length * step;
  const svgH = TOP + 7 * step;

  function level(v: number): number {
    if (v <= 0) return 0;
    if (v <= thresholds[0]!) return 1;
    if (v <= thresholds[1]!) return 2;
    if (v <= thresholds[2]!) return 3;
    return 4;
  }

  return (
    <div className="mx-heatmap" ref={wrapRef}>
      <div className="mx-heatmap-inner" style={{ width: svgW, height: svgH, position: "relative" }}>
        <svg width={svgW} height={svgH} role="img" aria-label="Activity calendar">
          {monthLabels.map((m) => (
            <text key={`${m.col}-${m.label}`} x={LEFT + m.col * step} y={11} className="mx-hm-month">{m.label}</text>
          ))}
          {WEEKDAYS.map((d, row) => d ? (
            <text key={row} x={0} y={TOP + row * step + cell - 1} className="mx-hm-wd">{d}</text>
          ) : null)}
          {weeks.map((w, col) =>
            w.map((key, row) => {
              const v = valueOf(bucket.get(key), metric);
              return (
                <rect
                  key={key}
                  x={LEFT + col * step}
                  y={TOP + row * step}
                  width={cell}
                  height={cell}
                  rx={Math.max(2, cell * 0.22)}
                  className={`mx-hm-cell lvl-${level(v)}`}
                  onMouseEnter={(e) => {
                    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
                    setHover({ x: r.left + r.width / 2, y: r.top, key, v });
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              );
            }),
          )}
        </svg>
      </div>
      {mounted && hover && createPortal(
        <div className="mx-hm-tip" style={{ position: "fixed", left: hover.x, top: hover.y - 8, transform: "translate(-50%, -100%)" }}>
          <span className="d">{fmtDay(hover.key)}</span>
          <span className="v">{fmtMetric(hover.v, metric)}</span>
        </div>,
        document.body,
      )}
      <div className="mx-hm-legend">
        <span>Less</span>
        <span className="mx-hm-cell lvl-0" />
        <span className="mx-hm-cell lvl-1" />
        <span className="mx-hm-cell lvl-2" />
        <span className="mx-hm-cell lvl-3" />
        <span className="mx-hm-cell lvl-4" />
        <span>More</span>
      </div>
    </div>
  );
}
