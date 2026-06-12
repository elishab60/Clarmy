import { COLS, ROWS } from "./layout";
import { key } from "./types";

// Plain BFS on the tile grid (pattern from pixel-agents): maps are small
// (36x22), 4-neighbour, blocked tiles in a Set for O(1) checks. Returns the
// list of tiles to traverse EXCLUDING the start, or null when unreachable.
export function findPath(
  fromCol: number,
  fromRow: number,
  toCol: number,
  toRow: number,
  blocked: ReadonlySet<string>,
): Array<{ col: number; row: number }> | null {
  if (fromCol === toCol && fromRow === toRow) return [];
  const startKey = key(fromCol, fromRow);
  const goalKey = key(toCol, toRow);
  const prev = new Map<string, string>();
  const queue: Array<[number, number]> = [[fromCol, fromRow]];
  const seen = new Set([startKey]);

  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const k = key(nc, nr);
      if (seen.has(k)) continue;
      // the goal tile may itself be "blocked" (a seat) - allow entering it
      if (blocked.has(k) && k !== goalKey) continue;
      seen.add(k);
      prev.set(k, key(c, r));
      if (k === goalKey) {
        const path: Array<{ col: number; row: number }> = [];
        let cur = goalKey;
        while (cur !== startKey) {
          const [cc, cr] = cur.split(",").map(Number);
          path.unshift({ col: cc!, row: cr! });
          cur = prev.get(cur)!;
        }
        return path;
      }
      queue.push([nc, nr]);
    }
  }
  return null;
}
