"use client";

import { useCockpit } from "./store";
import { WS_PATH, type ClientMessage, type ServerMessage } from "../shared/ws-protocol";

let active: WebSocket | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let backoffMs = 600;

export function startWsClient(): () => void {
  if (typeof window === "undefined") return () => {};
  connect();
  return () => {
    if (retryTimer) clearTimeout(retryTimer);
    active?.close();
    active = null;
  };
}

function connect(): void {
  const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${WS_PATH}`;
  const ws = new WebSocket(url);
  active = ws;

  ws.addEventListener("open", () => {
    backoffMs = 600;
    useCockpit.getState().setConnected(true);
    send(ws, { type: "subscribe", all: true });
  });

  ws.addEventListener("message", (ev: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(ev.data) as ServerMessage;
      if (msg.type === "hello") useCockpit.getState().hydrateSessions(msg.sessions);
      else if (msg.type === "session.event") useCockpit.getState().applyEvent(msg.event);
      else if (msg.type === "metrics.dirty") useCockpit.getState().bumpMetrics();
    } catch { /* ignore */ }
  });

  const reconnect = () => {
    useCockpit.getState().setConnected(false);
    active = null;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, backoffMs);
    backoffMs = Math.min(backoffMs * 1.8, 8000);
  };

  ws.addEventListener("close", reconnect);
  ws.addEventListener("error", () => ws.close());
}

function send(ws: WebSocket, msg: ClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
