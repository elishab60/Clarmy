import type { SessionState } from "@/lib/shared/types";
import {
  COFFEE_SPOTS, GOTH_SPOTS, KNIGHT_SPOTS, LOUNGE_SEATS, SPECTATOR_SPOTS, TOOL_SPOTS,
} from "./layout";
import type { Character } from "./character";
import type { Desk, Spot } from "./types";

// Canonical state -> behavior mapping. Codex/Copilot idles at the poster wall
// watching Chinese AIs; everyone else follows the standard office loop.

export function applyState(
  ch: Character,
  state: SessionState,
  desk: Desk,
  rng: () => number,
): void {
  const provider = ch.session.provider;
  switch (state) {
    case "running":
      ch.goTo(desk.seat, "sit_type");
      return;
    case "tool_use":
      ch.goTo(pick(TOOL_SPOTS, ch.id, rng), "use_tool");
      return;
    case "idle":
      if (provider === "codex") {
        ch.goTo(pick(SPECTATOR_SPOTS, ch.id, rng), "spectate");
        return;
      }
      if (provider === "grok") {
        ch.goTo(pick(GOTH_SPOTS, ch.id, rng), "stand");
        return;
      }
      if (provider === "gemini") {
        if (rng() < 0.45) {
          ch.goTo(pick(KNIGHT_SPOTS, ch.id, rng), "stand");
          return;
        }
        ch.goTo(desk.seat, "sit_read");
        return;
      }
      if (provider === "claude" && rng() < 0.35) {
        ch.goTo(pick(COFFEE_SPOTS, ch.id, rng), "stand");
        return;
      }
      if (rng() < 0.25) {
        ch.goTo(pick(COFFEE_SPOTS, ch.id, rng), "stand");
        return;
      }
      ch.goTo(desk.seat, "sit_read");
      return;
    case "approval":
      ch.goTo({ col: desk.seat.col, row: desk.seat.row + 1, face: "down" }, "alert");
      return;
    case "error":
      ch.goTo({ col: desk.seat.col, row: desk.seat.row + 1, face: "down" }, "dizzy");
      return;
    case "done": {
      const lounge = provider === "gemini"
        ? pick(KNIGHT_SPOTS, ch.id, rng)
        : provider === "grok"
          ? pick(GOTH_SPOTS, ch.id, rng)
          : pick(LOUNGE_SEATS, ch.id, rng);
      ch.setMode("celebrate");
      setTimeout(() => {
        if (ch.session.state === "done") ch.goTo(lounge, "lounge");
      }, 1_600);
      return;
    }
  }
}

function pick(spots: readonly Spot[], id: string, _rng: () => number): Spot {
  return spots[hash(id) % spots.length]!;
}

export function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h;
}