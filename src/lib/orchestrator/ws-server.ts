import type { IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import { WS_PATH, WS_PROTOCOL_VERSION, type ServerMessage, type ClientMessage } from "../shared/ws-protocol.ts";
import { getManager } from "./manager.ts";
import { getMetricsIndex } from "../providers/metrics-index.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("ws");
const PTY_PATH = "/pty";

export function attachWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });
  const pty = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === WS_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
      return;
    }
    if (url.pathname === PTY_PATH) {
      pty.handleUpgrade(req, socket, head, (ws) => pty.emit("connection", ws, req));
      return;
    }
    socket.destroy();
  });

  pty.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const id = url.searchParams.get("id") ?? "";
    const runner = getManager().getPty(id);
    if (!runner) {
      try { ws.send(JSON.stringify({ kind: "error", message: `unknown pty session ${id}` })); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
      return;
    }
    log.info("pty client connected", { id });
    try {
      const hist = runner.getHistory();
      if (hist.length) ws.send(hist);
    } catch (err) { log.error("pty history send failed", { err: String(err) }); }

    const offData = runner.onData((buf) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try { ws.send(buf); } catch { /* ignore */ }
    });
    const offExit = runner.onExit((code) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      try { ws.send(JSON.stringify({ kind: "exit", code })); } catch { /* ignore */ }
      try { ws.close(); } catch { /* ignore */ }
    });

    ws.on("message", (raw: Buffer, isBinary: boolean) => {
      if (isBinary) { runner.write(raw); return; }
      try {
        const msg = JSON.parse(raw.toString("utf8")) as { kind?: string; cols?: number; rows?: number; data?: string };
        if (msg.kind === "resize" && typeof msg.cols === "number" && typeof msg.rows === "number") {
          runner.resize(msg.cols, msg.rows);
          return;
        }
        if (msg.kind === "input" && typeof msg.data === "string") {
          runner.write(msg.data);
          return;
        }
      } catch { /* ignore malformed */ }
      // treat plain text as input
      runner.write(raw);
    });

    ws.on("close", () => { offData(); offExit(); log.info("pty client disconnected", { id }); });
  });

  const manager = getManager();
  const unsub = manager.subscribe((event) => {
    broadcast(wss, { type: "session.event", event });
  });
  const unsubMetrics = getMetricsIndex().subscribe(() => {
    broadcast(wss, { type: "metrics.dirty", at: Date.now() });
  });

  wss.on("connection", (ws: WebSocket) => {
    log.info("client connected", { clients: wss.clients.size });
    send(ws, { type: "hello", version: WS_PROTOCOL_VERSION, sessions: manager.list() });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;
        if (msg.type === "ping") send(ws, { type: "pong", at: Date.now() });
      } catch { /* ignore malformed */ }
    });

    ws.on("close", () => log.info("client disconnected", { clients: wss.clients.size - 1 }));
  });

  wss.on("close", () => { unsub(); unsubMetrics(); });
  return wss;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(wss: WebSocketServer, msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}
