import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { attachWebSocket } from "./src/lib/orchestrator/ws-server.ts";
import { getManager } from "./src/lib/orchestrator/manager.ts";
import { createLogger } from "./src/lib/util/logger.ts";

const log = createLogger("server");
const port = Number(process.env.COCKPIT_PORT ?? process.env.PORT ?? 3010);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

await app.prepare();

getManager().restore();

const server = createServer((req, res) => {
  const parsed = parse(req.url ?? "/", true);
  void handle(req, res, parsed);
});

attachWebSocket(server);

server.listen(port, () => {
  log.info("cockpit listening", { port, dev, mock: process.env.COCKPIT_MOCK === "1" });
});
