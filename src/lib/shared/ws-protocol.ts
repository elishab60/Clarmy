import type { SessionEvent, SessionSnapshot } from "./types.ts";
import type { QuotasResponse } from "./quota.ts";

export type ServerMessage =
  | { type: "hello"; version: string; sessions: readonly SessionSnapshot[] }
  | { type: "session.event"; event: SessionEvent }
  // Transcript data changed on disk; clients refetch /api/metrics (now a
  // cache read) instead of polling on a timer.
  | { type: "metrics.dirty"; at: number }
  // Periodic provider quota snapshot, pushed only when it changed; clients
  // render it directly instead of polling /api/quotas.
  | { type: "quotas.update"; payload: QuotasResponse }
  | { type: "pong"; at: number };

export type ClientMessage =
  | { type: "ping"; at: number }
  | { type: "subscribe"; all: true };

export const WS_PATH = "/ws" as const;
export const WS_PROTOCOL_VERSION = "0.1.0" as const;
