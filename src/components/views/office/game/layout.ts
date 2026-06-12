import { TILE, key, type Desk, type Spot } from "./types";

// Hand-crafted office: a single room with desk pods, a tool wall (bookshelves
// + whiteboard), a coffee corner and a lounge. Everything is tile data here;
// the scene just draws it. Coordinates are tile (col,row), origin top-left.

export const COLS = 36;
export const ROWS = 22;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

// Decor: atlas frame + tile position (+ optional pixel offset). Drawn in
// order; chars z-sort against these via their bottom y.
export interface Decor {
  readonly frame: string;
  readonly col: number;
  readonly row: number;
  readonly block?: boolean;   // occupies the tile for pathfinding
  readonly tall?: boolean;    // 16x32 art anchored on its bottom tile
}

// 8 desk pods, 2 rows of 4. Each desk: PC (tall, on the desk tile) and the
// chair one tile BELOW it; the character sits on the chair facing up.
function desks(): Desk[] {
  const out: Desk[] = [];
  const podCols = [5, 10, 15, 20];
  const podRows = [6, 12];
  let id = 0;
  for (const r of podRows) {
    for (const c of podCols) {
      out.push({ id: id++, seat: { col: c, row: r + 1, face: "up" }, pcCol: c, pcRow: r });
      out.push({ id: id++, seat: { col: c + 1, row: r + 1, face: "up" }, pcCol: c + 1, pcRow: r });
    }
  }
  return out;
}

export const DESKS: Desk[] = desks();

// Tool wall on the right: stand in front of a bookshelf, face up.
export const TOOL_SPOTS: Spot[] = [
  { col: 27, row: 5, face: "up" },
  { col: 28, row: 5, face: "up" },
  { col: 30, row: 5, face: "up" },
  { col: 31, row: 5, face: "up" },
  { col: 27, row: 9, face: "up" },
  { col: 28, row: 9, face: "up" },
];

// Coffee corner (top-left) and lounge (bottom-right).
export const COFFEE_SPOTS: Spot[] = [
  { col: 2, row: 3, face: "up" },
  { col: 3, row: 3, face: "up" },
];
export const LOUNGE_SEATS: Spot[] = [
  { col: 28, row: 17, face: "down" },
  { col: 29, row: 17, face: "down" },
  { col: 31, row: 17, face: "down" },
  { col: 26, row: 19, face: "down" },
  { col: 32, row: 19, face: "down" },
];

export const DECOR: Decor[] = [
  // coffee corner
  { frame: "COFFEE", col: 2, row: 2, block: true, tall: true },
  { frame: "SMALL_TABLE", col: 3, row: 2, block: true },
  { frame: "PLANT", col: 1, row: 2, block: true, tall: true },
  { frame: "BIN", col: 4, row: 2, block: true },
  // tool wall: shelves the agents "use"
  { frame: "DOUBLE_BOOKSHELF", col: 27, row: 4, block: true, tall: true },
  { frame: "BOOKSHELF", col: 30, row: 4, block: true, tall: true },
  { frame: "BOOKSHELF", col: 31, row: 4, block: true, tall: true },
  { frame: "DOUBLE_BOOKSHELF", col: 27, row: 8, block: true, tall: true },
  { frame: "WHITEBOARD", col: 30, row: 8, block: true, tall: true },
  // lounge
  { frame: "SOFA_FRONT", col: 28, row: 16, block: true },
  { frame: "SOFA_FRONT", col: 31, row: 16, block: true },
  { frame: "COFFEE_TABLE", col: 29, row: 18, block: true },
  { frame: "CUSHIONED_BENCH", col: 26, row: 18, block: true },
  { frame: "CUSHIONED_BENCH", col: 32, row: 18, block: true },
  { frame: "LARGE_PLANT", col: 33, row: 15, block: true, tall: true },
  // greenery scattered
  { frame: "LARGE_PLANT", col: 1, row: 19, block: true, tall: true },
  { frame: "CACTUS", col: 23, row: 2, block: true },
  { frame: "PLANT", col: 12, row: 2, block: true, tall: true },
  { frame: "CLOCK", col: 17, row: 0, tall: true },
];

// Walkability: outer ring is wall, decor and desks block their tiles.
export function buildBlocked(): Set<string> {
  const blocked = new Set<string>();
  for (let c = 0; c < COLS; c += 1) { blocked.add(key(c, 0)); blocked.add(key(c, ROWS - 1)); }
  for (let r = 0; r < ROWS; r += 1) { blocked.add(key(0, r)); blocked.add(key(COLS - 1, r)); }
  for (const d of DECOR) if (d.block) blocked.add(key(d.col, d.row));
  for (const d of DESKS) blocked.add(key(d.pcCol, d.pcRow)); // the desk itself
  return blocked;
}

// Floor pattern: quiet checker of two dark floors, lounge rug in a third.
export function floorFrame(col: number, row: number): string {
  if (col >= 25 && row >= 15) return "floor_4";
  return (col + row) % 2 === 0 ? "floor_0" : "floor_1";
}
