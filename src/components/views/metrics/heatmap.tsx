"use client";

import { useMemo, useState } from "react";
import type { DayBucket, HeatMetric } from "./types.ts";
import { fmtCostFull, fmtDay, fmtInt, fmtTokens } from "./format.ts";

const CELL = 12;
const GAP = 3;
const STEP = CELL + GAP;
const TOP = 18;
const LEFT = 26;
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
  return new Date(`${key}T00:00:00Z`).getUTCDay(); // 0 = Sun
}

function valueOf(b: DayBucket | undefined, metric: HeatMetric): number {
  if (!b) return 0;
  return metric === "sessions" ? b.sessions : metric === "cost" ? b.cost : b.output;
}

function fmtMetric(v: number, metric: HeatMetric): string {
  return metric === "cost" ? fmtCostFull(v) : metric === "output" ? `${fmtTokens(v)} output tok` : `${fmtInt(v)} session${v === 1 ? "" : "s"}`;
}

export function Heatmap({
  bucket,
  metric,
  from,
  to,
}: {
  bucket: Map<string, DayBucket>;
  metric: HeatMetric;
  from: number;
  to: number;
}) {
  const [hover, setHover] = useState<{ col: number; row: number; key: string; v: number } | null>(null);

  const { weeks, thresholds, monthLabels } = useMemo(() => {
    const startKey = keyUTC(from);
    const start = addDays(startKey, -weekday(startKey)); // back to Sunday
    const endKey = keyUTC(to);
    const days: string[] = [];
    let cur = start;
    // cap to avoid pathological spans
    for (let i = 0; i < 800 && cur <= endKey; i++) {
      days.push(cur);
      cur = addDays(cur, 1);
    }
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

  function level(v: number): number {
    if (v <= 0) return 0;
    if (v <= thresholds[0]!) return 1;
    if (v <= thresholds[1]!) return 2;
    if (v <= thresholds[2]!) return 3;
    return 4;
  }

  const width = LEFT + weeks.length * STEP;
  const height = TOP + 7 * STEP;

  return (
    <div className="mx-heatmap">
      <div className="mx-heatmap-scroll">
        <div className="mx-heatmap-inner" style={{ width, height, position: "relative" }}>
          <svg width={width} height={height} role="img" aria-label="Activity calendar">
            {monthLabels.map((m) => (
              <text key={`${m.col}-${m.label}`} x={LEFT + m.col * STEP} y={11} className="mx-hm-month">{m.label}</text>
            ))}
            {WEEKDAYS.map((d, row) => d ? (
              <text key={row} x={0} y={TOP + row * STEP + CELL - 1} className="mx-hm-wd">{d}</text>
            ) : null)}
            {weeks.map((w, col) =>
              w.map((key, row) => {
                const v = valueOf(bucket.get(key), metric);
                const lvl = level(v);
                return (
                  <rect
                    key={key}
                    x={LEFT + col * STEP}
                    y={TOP + row * STEP}
                    width={CELL}
                    height={CELL}
                    rx={2.5}
                    className={`mx-hm-cell lvl-${lvl}`}
                    onMouseEnter={() => setHover({ col, row, key, v })}
                    onMouseLeave={() => setHover(null)}
                  />
                );
              }),
            )}
          </svg>
          {hover && (
            <div
              className="mx-hm-tip"
              style={{ left: LEFT + hover.col * STEP + CELL / 2, top: TOP + hover.row * STEP - 6 }}
            >
              <span className="d">{fmtDay(hover.key)}</span>
              <span className="v">{fmtMetric(hover.v, metric)}</span>
            </div>
          )}
        </div>
      </div>
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
