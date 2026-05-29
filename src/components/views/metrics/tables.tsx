"use client";

import { useState, type CSSProperties } from "react";
import type { GroupRow } from "./types.ts";
import { fmtCost, fmtInt, fmtRel, fmtTokens } from "./format.ts";

type SortKey = "cost" | "sessions" | "output" | "input" | "toolUses" | "lastRunAt" | "cacheRead";

export function GroupTable({
  rows,
  kind,
  activeKeys,
  onToggle,
}: {
  rows: readonly GroupRow[];
  kind: "project" | "model";
  activeKeys?: ReadonlySet<string>;
  onToggle?: (key: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [dir, setDir] = useState<1 | -1>(-1); // -1 = descending
  const sorted = [...rows].sort((a, b) => ((a[sortKey] as number) - (b[sortKey] as number)) * dir);
  const maxCost = Math.max(1e-9, ...rows.map((r) => r.cost));
  const clickable = kind === "project" && !!onToggle;

  const clickTh = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === -1 ? 1 : -1));
    else { setSortKey(k); setDir(-1); }
  };

  const Th = ({ k, children, first }: { k?: SortKey; children: React.ReactNode; first?: boolean }) => (
    <button
      type="button"
      className={`mx-th${k ? " sortable" : ""}${sortKey === k ? " active" : ""}`}
      style={first ? undefined : { textAlign: "right", justifyContent: "flex-end" }}
      onClick={k ? () => clickTh(k) : undefined}
      disabled={!k}
    >
      {children}<span className="mx-th-arrow">{sortKey === k ? (dir === -1 ? "↓" : "↑") : ""}</span>
    </button>
  );

  const cols = kind === "project"
    ? "minmax(180px,1fr) 70px 78px 78px 64px 110px 78px"
    : "minmax(180px,1fr) 70px 78px 78px 96px 110px";

  return (
    <div className="mx-table-scroll">
      <div className="mx-table" style={{ minWidth: kind === "project" ? 740 : 660 }}>
        <div className="mx-trow mx-thead" style={{ gridTemplateColumns: cols }}>
          <Th first>{kind}</Th>
          <Th k="sessions">sessions</Th>
          <Th k="input">input</Th>
          <Th k="output">output</Th>
          <Th k="toolUses">tools</Th>
          <Th k="cost">cost</Th>
          {kind === "project" ? <Th k="lastRunAt">last run</Th> : <Th k="cacheRead">cache</Th>}
        </div>
        {sorted.length === 0 && <div className="mx-trow mx-empty"><span>no data in range</span></div>}
        {sorted.map((g) => {
          const on = activeKeys?.has(g.key);
          return (
            <div
              key={g.key}
              className={`mx-trow mx-drow${clickable ? " clickable" : ""}${on ? " on" : ""}`}
              style={{ gridTemplateColumns: cols }}
              onClick={clickable ? () => onToggle!(g.key) : undefined}
              title={clickable ? (on ? "remove filter" : "filter to this project") : undefined}
            >
              <span className="mx-name">
                <span className="t" title={g.label}>{g.label}</span>
                {g.sub && <span className="s" title={g.sub}>{g.sub}</span>}
              </span>
              <span className="mx-num">{fmtInt(g.sessions)}</span>
              <span className="mx-num">{fmtTokens(g.input)}</span>
              <span className="mx-num">{fmtTokens(g.output)}</span>
              <span className="mx-num">{fmtInt(g.toolUses)}</span>
              <span className="mx-num">
                <span className="mx-costbar" style={{ ["--t" as string]: `${g.cost / maxCost}` } as CSSProperties}>
                  <span>{fmtCost(g.cost)}</span>
                </span>
              </span>
              <span className="mx-num">{kind === "project" ? fmtRel(g.lastRunAt) : fmtTokens(g.cacheRead)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
