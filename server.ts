import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachWebSocket } from "./src/lib/orchestrator/ws-server.ts";
import { attachProxyWs } from "./src/lib/orchestrator/proxy-ws.ts";
import { getManager } from "./src/lib/orchestrator/manager.ts";
import { startCronScheduler } from "./src/lib/orchestrator/cron-scheduler.ts";
import { role } from "./src/lib/orchestrator/role.ts";
import { handleMcpHttp } from "./src/lib/mcp/http.ts";
import { getMetricsIndex } from "./src/lib/providers/metrics-index.ts";
import { createLogger } from "./src/lib/util/logger.ts";

const log = createLogger("server");
const port = Number(process.env.COCKPIT_PORT ?? process.env.PORT ?? 3010);
const dev = process.env.NODE_ENV !== "production";
const r = role();

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

if (r !== "app") {
  // solo: Next + orchestrator in one process (native dev). The SessionManager
  // lives here. In app role it lives in the orchestrator daemon instead.
  getManager().restore();
  startCronScheduler();
  // Watch transcript roots so /api/metrics serves from cache and clients get
  // a WS nudge instead of polling.
  getMetricsIndex().startWatching();
}

const server = createServer((req, res) => {
  const parsed = parse(req.url ?? "/", true);
  // Serve MCP from THIS module graph, not Next's compiled one: piloted sessions
  // hit the same manager/bus/key instances the spawner used. The Next route at
  // the same path stays as a fallback (it reads the same persisted key).
  if (parsed.pathname === "/api/mcp-bridge" && r !== "app") {
    void handleMcpHttp(req, res);
    return;
  }
  void handle(req, res, parsed);
});

if (r === "app") attachProxyWs(server);
else attachWebSocket(server);

server.listen(port, () => {
  log.info("cockpit listening", { port, dev, role: r, mock: process.env.COCKPIT_MOCK === "1" });
  if (r !== "app") {
    // Warm the metrics index AFTER we are serving: the underlying scanners are
    // synchronous, so the cold scan blocks the event loop for a few seconds.
    // Deferring it keeps the first health checks and page loads snappy; the
    // block then happens once, in one chunk, instead of on a user request.
    setTimeout(() => {
      void getMetricsIndex().payload().catch(() => { /* first request will retry */ });
    }, 1_500).unref();
  }
});

// Graceful shutdown: kill child CLIs (and their MCP configs), stop the fs
// watchers, close the listener. A hard exit fallback guarantees we never hang.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info("shutting down", { signal });
  setTimeout(() => process.exit(0), 4_500).unref(); // hard stop fallback
  try { getMetricsIndex().stopWatching(); } catch { /* best effort */ }
  if (r !== "app") {
    try { await getManager().shutdownAll(); } catch { /* best effort */ }
  }
  server.close(() => process.exit(0));
  // Keep-alive sockets would otherwise hold close() open until the fallback.
  server.closeAllConnections();
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
