"use client";

import type { JSX } from "react";

const W = 11;
const H = 8;

const FRAME_A = [
  "...o...o...",
  "...B...B...",
  ".ooooooooo.",
  "dooooooooor",
  "dooooooooor",
  ".ooooooooo.",
  "o.o.o.o.o.o",
  "o.........o",
];

const FRAME_B = [
  "...o...o...",
  "...B...B...",
  ".ooooooooo.",
  "dooooooooor",
  "dooooooooor",
  ".ooooooooo.",
  ".o.o.o.o.o.",
  ".o.......o.",
];

const COLOR: Record<string, string> = {
  o: "#ff7a3a",
  d: "#b04f1a",
  r: "#b04f1a",
  B: "#0a0a0a",
};

function pixels(grid: string[]) {
  const out: JSX.Element[] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y] ?? "";
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (!c || c === "." || c === " ") continue;
      const fill = COLOR[c];
      if (!fill) continue;
      out.push(<rect key={`${x},${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  }
  return out;
}

export function Clawd({ size = 20 }: { size?: number }) {
  const width = Math.round((size * W) / H);
  return (
    <svg
      className="clawd"
      width={width}
      height={size}
      viewBox={`0 0 ${W} ${H}`}
      shapeRendering="crispEdges"
      aria-label="Clawd"
      role="img"
    >
      <g className="clawd-a">{pixels(FRAME_A)}</g>
      <g className="clawd-b">{pixels(FRAME_B)}</g>
    </svg>
  );
}
