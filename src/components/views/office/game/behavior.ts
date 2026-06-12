import type { SessionState } from "@/lib/shared/types";
import { COFFEE_SPOTS, LOUNGE_SEATS, TOOL_SPOTS } from "./layout";
import type { Character } from "./character";
import type { Desk, Spot } from "./types";

// Canonical state -> behavior mapping (spec §5). CLARMY has six real states;
// the spec's separate "waiting" row is our `idle` (labelled "waiting" in the
// status bar), so idle blends both: mostly wait at the desk, with occasional
// coffee wanders so the office feels alive.
//
// running   -> own desk, typing (PC on)
// tool_use  -> walk to a tool station (shelves), consult
// idle      -> sit at desk reading; sometimes coffee break
// approval  -> stand at the desk, pulsing orange "!"
// error     -> dizzy sway + red cross
// done      -> celebrate at desk, then settle in the lounge

export function applyState(ch: Character, state: SessionState, desk: Desk, rng: () => number): void {
  switch (state) {
    case "running":
      ch.goTo(desk.seat, "sit_type");
      return;
    case "tool_use":
      ch.goTo(pick(TOOL_SPOTS, ch.id, rng), "use_tool");
      return;
    case "idle": {
      if (rng() < 0.3) {
        const coffee = pick(COFFEE_SPOTS, ch.id, rng);
        ch.goTo(coffee, "stand");
        return;
      }
      ch.goTo(desk.seat, "sit_read");
      return;
    }
    case "approval":
      // stand up next to the desk and demand attention
      ch.goTo({ col: desk.seat.col, row: desk.seat.row + 1, face: "down" }, "alert");
      return;
    case "error":
      ch.goTo({ col: desk.seat.col, row: desk.seat.row + 1, face: "down" }, "dizzy");
      return;
    case "done": {
      const lounge = pick(LOUNGE_SEATS, ch.id, rng);
      ch.setMode("celebrate");
      // linger on the celebration, then head to the lounge
      setTimeout(() => {
        if (ch.session.state === "done") ch.goTo(lounge, "lounge");
      }, 1_600);
      return;
    }
  }
}

// Deterministic-ish pick: hash the id so a session keeps the same coffee spot
// or lounge seat across re-applies, with rng as a tiebreak for idle variety.
function pick(spots: readonly Spot[], id: string, _rng: () => number): Spot {
  return spots[hash(id) % spots.length]!;
}

export function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h;
}
