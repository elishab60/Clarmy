import type { ProviderId } from "@/lib/shared/types";
import { TILE, key, type Desk, type Spot } from "./types";

// AI Headquarters: four themed zones around a central desk cluster.
// Grok = gothic corner (NW), Claude = library (NE), Gemini = knight hall (SW),
// Codex/Copilot = spectator lounge with Chinese-AI posters (SE).

export const COLS = 40;
export const ROWS = 24;
export const WORLD_W = COLS * TILE;
export const WORLD_H = ROWS * TILE;

export interface Decor {
  readonly frame: string;
  readonly col: number;
  readonly row: number;
  readonly block?: boolean;
  readonly tall?: boolean;
  readonly floor?: boolean;   // 16x16 tile drawn at ground level
}

// 8 desks in two pods, slightly wider spacing for the themed perimeter.
function desks(): Desk[] {
  const out: Desk[] = [];
  const podCols = [14, 19, 24, 29];
  const podRows = [9, 15];
  let id = 0;
  for (const r of podRows) {
    for (const c of podCols) {
      out.push({ id: id++, seat: { col: c, row: r + 1, face: "up" }, pcCol: c, pcRow: r });
    }
  }
  return out;
}

export const DESKS: Desk[] = desks();

export const TOOL_SPOTS: Spot[] = [
  { col: 33, row: 5, face: "up" },
  { col: 34, row: 5, face: "up" },
  { col: 35, row: 5, face: "up" },
];

export const COFFEE_SPOTS: Spot[] = [
  { col: 5, row: 5, face: "up" },
  { col: 6, row: 5, face: "up" },
];

export const LOUNGE_SEATS: Spot[] = [
  { col: 32, row: 19, face: "down" },
  { col: 33, row: 19, face: "down" },
  { col: 35, row: 19, face: "down" },
  { col: 32, row: 21, face: "down" },
];

// Codex watches the Chinese-AI poster wall when idle.
export const SPECTATOR_SPOTS: Spot[] = [
  { col: 34, row: 17, face: "left" },
  { col: 35, row: 17, face: "left" },
  { col: 33, row: 18, face: "left" },
];

// Grok broods in the gothic corner between tasks.
export const GOTH_SPOTS: Spot[] = [
  { col: 3, row: 4, face: "up" },
  { col: 4, row: 4, face: "up" },
  { col: 2, row: 5, face: "right" },
];

// Gemini meditates in the knight hall when idle.
export const KNIGHT_SPOTS: Spot[] = [
  { col: 3, row: 19, face: "up" },
  { col: 2, row: 20, face: "up" },
];

// Each provider walks in from their themed zone.
export const SPAWN_BY_PROVIDER: Record<ProviderId, Spot> = {
  grok: { col: 3, row: 5, face: "down" },
  claude: { col: 35, row: 5, face: "down" },
  gemini: { col: 3, row: 20, face: "up" },
  codex: { col: 34, row: 16, face: "down" },
};

export interface ZoneLabel {
  readonly text: string;
  readonly col: number;
  readonly row: number;
  readonly color: string;
}

export const ZONE_LABELS: readonly ZoneLabel[] = [
  { text: "NÉCROPOLIS", col: 2, row: 1, color: "#9B7CFF" },
  { text: "BIBLIOTHÈQUE", col: 33, row: 1, color: "#D97757" },
  { text: "GRAND SALON", col: 1, row: 16, color: "#4796E3" },
  { text: "ZONE DÉGOUT", col: 31, row: 14, color: "#10A37F" },
];

export const DECOR: Decor[] = [
  // ── Grok gothic corner (top-left) ──
  { frame: "GOTHIC_RUG", col: 2, row: 3, floor: true },
  { frame: "GOTHIC_RUG", col: 3, row: 3, floor: true },
  { frame: "SKULL_CANDLE", col: 2, row: 2, block: true, tall: true },
  { frame: "SKULL_CANDLE", col: 4, row: 2, block: true, tall: true },
  { frame: "PLANT", col: 1, row: 3, block: true, tall: true },
  { frame: "COFFEE", col: 5, row: 3, block: true, tall: true },
  { frame: "SMALL_TABLE", col: 6, row: 3, block: true },

  // ── Claude library (top-right) ──
  { frame: "RUG_WOOD", col: 33, row: 2, floor: true },
  { frame: "RUG_WOOD", col: 34, row: 2, floor: true },
  { frame: "BOOKSHELF_FANCY", col: 36, row: 2, block: true, tall: true },
  { frame: "DOUBLE_BOOKSHELF", col: 37, row: 2, block: true, tall: true },
  { frame: "WHITEBOARD", col: 33, row: 4, block: true, tall: true },
  { frame: "CLOCK", col: 38, row: 3, block: true, tall: true },

  // ── Gemini knight hall (bottom-left) ──
  { frame: "STONE_FLOOR", col: 2, row: 18, floor: true },
  { frame: "STONE_FLOOR", col: 3, row: 18, floor: true },
  { frame: "STONE_FLOOR", col: 2, row: 19, floor: true },
  { frame: "STONE_FLOOR", col: 3, row: 19, floor: true },
  { frame: "KNIGHT_BANNER", col: 1, row: 17, block: true, tall: true },
  { frame: "KNIGHT_BANNER", col: 4, row: 17, block: true, tall: true },
  { frame: "CUSHIONED_BENCH", col: 2, row: 20, block: true },
  { frame: "COFFEE_TABLE", col: 3, row: 21, block: true },

  // ── Codex spectator lounge + Chinese-AI posters (bottom-right) ──
  { frame: "POSTER_DEEPSEEK", col: 32, row: 15, block: true, tall: true },
  { frame: "POSTER_QWEN", col: 34, row: 15, block: true, tall: true },
  { frame: "POSTER_KIMI", col: 36, row: 15, block: true, tall: true },
  { frame: "SPECTATOR_CHAIR", col: 33, row: 18, block: true, tall: true },
  { frame: "SPECTATOR_CHAIR", col: 35, row: 18, block: true, tall: true },
  { frame: "CUSHIONED_BENCH", col: 32, row: 20, block: true },
  { frame: "CUSHIONED_BENCH", col: 35, row: 20, block: true },
  { frame: "LARGE_PLANT", col: 37, row: 19, block: true, tall: true },
];

export function buildBlocked(): Set<string> {
  const blocked = new Set<string>();
  for (let c = 0; c < COLS; c += 1) { blocked.add(key(c, 0)); blocked.add(key(c, ROWS - 1)); }
  for (let r = 0; r < ROWS; r += 1) { blocked.add(key(0, r)); blocked.add(key(COLS - 1, r)); }
  for (const d of DECOR) if (d.block) blocked.add(key(d.col, d.row));
  for (const d of DESKS) blocked.add(key(d.pcCol, d.pcRow));
  return blocked;
}