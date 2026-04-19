import type { SessionEvent, SessionSnapshot } from "./types.ts";

export type ServerMessage =
  | { type: "hello"; version: string; sessions: readonly SessionSnapshot[] }
  | { type: "session.event"; event: SessionEvent }
  | { type: "pong"; at: number };

export type ClientMessage =
  | { type: "ping"; at: number }
  | { type: "subscribe"; all: true };

export const WS_PATH = "/ws" as const;
export const WS_PROTOCOL_VERSION = "0.1.0" as const;
