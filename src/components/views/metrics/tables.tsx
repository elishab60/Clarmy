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
  const [sort, setSort] = useState<SortKey>("cost");
  const sorted = [...rows].sort((a, b) => (b[sort] as number) - (a[sort] as number));
  const maxCost = Math.max(1e-9, ...rows.map((r) => r.cost));
  const clickable = kind === "project" && !!onToggle;

  const Th = ({ k, children, first }: { k?: SortKey; children: React.ReactNode; first?: boolean }) => (
    <span
      className={`mx-th${k ? " sortable" : ""}${sort === k ? " active" : ""}`}
      style={first ? undefined : { textAlign: "right" }}
      onClick={k ? () => setSort(k) : undefined}
    >
      {children}{sort === k ? " ↓" : ""}
    </span>
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
