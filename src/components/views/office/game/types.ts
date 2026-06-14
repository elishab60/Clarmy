import type { ProviderId, SessionState } from "@/lib/shared/types";

export const TILE = 16;

export type Dir = "down" | "up" | "right" | "left";

// What a character is currently doing on screen (animation FSM), driven by
// (but distinct from) the session state. Transitions go through WALK.
export type CharMode =
  | "sit_type"    // at desk, typing, PC on
  | "sit_read"    // at desk, reading (calm)
  | "stand"       // standing still
  | "walk"        // following a path
  | "use_tool"    // standing at a tool station, reading anim
  | "alert"       // standing at desk, orange "!" (approval)
  | "dizzy"       // error: sway + red cross
  | "celebrate"   // done: bounce, then heads to the lounge
  | "lounge"      // sitting in the lounge after done
  | "spectate";   // codex: watching the poster wall

export interface SessionLite {
  readonly id: string;
  readonly provider: ProviderId;
  readonly state: SessionState;
  readonly name: string;
  readonly project: string;
  readonly prompt?: string;
  readonly subagents?: number;
}

export interface Spot {
  readonly col: number;
  readonly row: number;
  readonly face: Dir;
}

export interface Desk {
  readonly id: number;
  readonly seat: Spot;       // chair tile the character sits on
  readonly pcCol: number;    // desk tile holding the PC (for on/off swap)
  readonly pcRow: number;
}

export function key(col: number, row: number): string {
  return `${col},${row}`;
}

// Warm, desaturated state palette (paper + terminal aesthetic).
export const STATE_TINT: Record<string, number> = {
  running: 0xd97757,   // Claude orange
  tool_use: 0xc9924d,  // soft amber
  idle: 0x8a857c,      // neutral grey
  approval: 0xd97757,  // orange, pulsed
  error: 0xb4554a,     // earthy red
  done: 0x7c9a6e,      // quiet sage
};
