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
  // a WS nudge instead of polling. Warm the index in the background so the
  // first request after boot is a cache read, not a full cold scan.
  getMetricsIndex().startWatching();
  void getMetricsIndex().payload().catch(() => { /* first request will retry */ });
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
});
