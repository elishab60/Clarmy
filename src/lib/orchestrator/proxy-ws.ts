import type { IncomingMessage, Server } from "node:http";
import type { Socket } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import { WS_PATH } from "../shared/ws-protocol.ts";
import { orchestratorUrl } from "./role.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("proxy-ws");
const PTY_PATH = "/pty";

function wsBase(): string {
  return orchestratorUrl().replace(/^http/, "ws").replace(/\/$/, "");
}

// App-role WebSocket: the browser keeps talking to /ws and /pty on this origin
// exactly as before; each connection is transparently piped to the matching
// endpoint on the orchestrator daemon. No protocol change client-side.
export function attachProxyWs(server: Server): void {
  const events = new WebSocketServer({ noServer: true });
  const pty = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === WS_PATH) {
      events.handleUpgrade(req, socket, head, (ws) => relay(ws, `${wsBase()}${WS_PATH}`));
      return;
    }
    if (url.pathname === PTY_PATH) {
      const q = url.search ?? "";
      pty.handleUpgrade(req, socket, head, (ws) => relay(ws, `${wsBase()}${PTY_PATH}${q}`));
      return;
    }
    socket.destroy();
  });
}

function relay(client: WebSocket, upstreamUrl: string): void {
  const upstream = new WebSocket(upstreamUrl);
  const pending: Array<{ data: Buffer; binary: boolean }> = [];
  let upstreamOpen = false;

  upstream.on("open", () => {
    upstreamOpen = true;
    for (const m of pending) upstream.send(m.data, { binary: m.binary });
    pending.length = 0;
  });

  // browser -> orchestrator
  client.on("message", (data: Buffer, isBinary: boolean) => {
    if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else {
      pending.push({ data, binary: isBinary });
    }
  });

  // orchestrator -> browser
  upstream.on("message", (data: Buffer, isBinary: boolean) => {
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });

  const closeBoth = () => {
    try { if (client.readyState === WebSocket.OPEN) client.close(); } catch { /* ignore */ }
    try { if (upstream.readyState === WebSocket.OPEN) upstream.close(); } catch { /* ignore */ }
  };
  client.on("close", closeBoth);
  upstream.on("close", closeBoth);
  client.on("error", closeBoth);
  upstream.on("error", (err) => {
    log.warn("upstream ws error", { url: upstreamUrl, err: String(err) });
    try { if (client.readyState === WebSocket.OPEN) client.close(); } catch { /* ignore */ }
  });
}
