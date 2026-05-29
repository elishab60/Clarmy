import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachWebSocket } from "./src/lib/orchestrator/ws-server.ts";
import { attachProxyWs } from "./src/lib/orchestrator/proxy-ws.ts";
import { getManager } from "./src/lib/orchestrator/manager.ts";
import { startCronScheduler } from "./src/lib/orchestrator/cron-scheduler.ts";
import { role } from "./src/lib/orchestrator/role.ts";
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
}

const server = createServer((req, res) => {
  const parsed = parse(req.url ?? "/", true);
  void handle(req, res, parsed);
});

if (r === "app") attachProxyWs(server);
else attachWebSocket(server);

server.listen(port, () => {
  log.info("cockpit listening", { port, dev, role: r, mock: process.env.COCKPIT_MOCK === "1" });
});
