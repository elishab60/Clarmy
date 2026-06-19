import type { SessionState } from "@/lib/shared/types";
import { IDLE_SPOTS } from "./layout";
import type { Character } from "./character";
import type { Desk, Spot } from "./types";

// Canonical state -> behavior mapping. Everything happens inside the session's
// own provider base; idle characters stand facing the camera (down) so they read
// clearly.

export function applyState(
  ch: Character,
  state: SessionState,
  desk: Desk,
  rng: () => number,
): void {
  const provider = ch.session.provider;
  // Providers without their own base (e.g. opencode) idle in the claude lounge.
  const idle = IDLE_SPOTS[provider] ?? IDLE_SPOTS.claude!;
  switch (state) {
    case "running":
      ch.goTo(desk.seat, "sit_type");
      return;
    case "tool_use":
      ch.goTo(desk.seat, "use_tool");
      return;
    case "idle":
      ch.goTo(pick(idle, ch.id), "stand");
      return;
    case "approval":
      ch.goTo({ col: desk.seat.col, row: desk.seat.row + 1, face: "down" }, "alert");
      return;
    case "error":
      ch.goTo({ col: desk.seat.col, row: desk.seat.row + 1, face: "down" }, "dizzy");
      return;
    case "done": {
      const lounge = pick(idle, ch.id);
      ch.setMode("celebrate");
      setTimeout(() => {
        if (ch.session.state === "done") ch.goTo(lounge, "lounge");
      }, 1_600);
      return;
    }
  }
}

function pick(spots: readonly Spot[], id: string): Spot {
  return spots[hash(id) % spots.length]!;
}

export function hash(text: string): number {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h;
}
