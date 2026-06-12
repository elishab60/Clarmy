import { TILE, key, type Desk, type Spot } from "./types";

// Minimalist office: lots of negative space, one clear desk cluster, a small
// coffee corner, a whiteboard tool corner and a quiet lounge. Tile data only;
// the scene draws a flat themed floor with a subtle grid (no tile checker).

export const COLS = 36;
export const ROWS = 22;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export interface Decor {
  readonly frame: string;
  readonly col: number;
  readonly row: number;
  readonly block?: boolean;
  readonly tall?: boolean;   // 16x32 art anchored on its bottom tile
}

// 8 desks, two pods of 4, centered with breathing room.
function desks(): Desk[] {
  const out: Desk[] = [];
  const podCols = [7, 12, 19, 24];
  const podRows = [6, 13];
  let id = 0;
  for (const r of podRows) {
    for (const c of podCols) {
      out.push({ id: id++, seat: { col: c, row: r + 1, face: "up" }, pcCol: c, pcRow: r });
    }
  }
  return out;
}

export const DESKS: Desk[] = desks();

// Tool corner: the whiteboard wall, top right.
export const TOOL_SPOTS: Spot[] = [
  { col: 29, row: 6, face: "up" },
  { col: 30, row: 6, face: "up" },
  { col: 31, row: 6, face: "up" },
];

// Coffee corner (top-left) and lounge (bottom-right).
export const COFFEE_SPOTS: Spot[] = [
  { col: 3, row: 4, face: "up" },
  { col: 4, row: 4, face: "up" },
];
export const LOUNGE_SEATS: Spot[] = [
  { col: 28, row: 17, face: "down" },
  { col: 29, row: 17, face: "down" },
  { col: 31, row: 17, face: "down" },
  { col: 28, row: 19, face: "down" },
];

export const DECOR: Decor[] = [
  // coffee corner: machine + a plant as the single green accent up here
  { frame: "COFFEE", col: 3, row: 3, block: true, tall: true },
  { frame: "SMALL_TABLE", col: 4, row: 3, block: true },
  { frame: "PLANT", col: 2, row: 3, block: true, tall: true },
  // tool corner: one whiteboard
  { frame: "WHITEBOARD", col: 29, row: 5, block: true, tall: true },
  { frame: "WHITEBOARD", col: 31, row: 5, block: true, tall: true },
  // lounge: wooden benches around a low table, one quiet plant
  { frame: "CUSHIONED_BENCH", col: 28, row: 16, block: true },
  { frame: "CUSHIONED_BENCH", col: 31, row: 16, block: true },
  { frame: "COFFEE_TABLE", col: 29, row: 18, block: true },
  { frame: "PLANT", col: 33, row: 17, block: true, tall: true },
];

export function buildBlocked(): Set<string> {
  const blocked = new Set<string>();
  for (let c = 0; c < COLS; c += 1) { blocked.add(key(c, 0)); blocked.add(key(c, ROWS - 1)); }
  for (let r = 0; r < ROWS; r += 1) { blocked.add(key(0, r)); blocked.add(key(COLS - 1, r)); }
  for (const d of DECOR) if (d.block) blocked.add(key(d.col, d.row));
  for (const d of DESKS) blocked.add(key(d.pcCol, d.pcRow));
  return blocked;
}
