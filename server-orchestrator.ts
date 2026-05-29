import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { attachWebSocket } from "./src/lib/orchestrator/ws-server.ts";
import { getManager } from "./src/lib/orchestrator/manager.ts";
import { startCronScheduler } from "./src/lib/orchestrator/cron-scheduler.ts";
import { orchestratorPort } from "./src/lib/orchestrator/role.ts";
import { createLogger } from "./src/lib/util/logger.ts";
import type { Effort, SpawnConfig } from "./src/lib/shared/types.ts";

const log = createLogger("orchestrator");
const port = orchestratorPort();

const manager = getManager();
manager.restore();
startCronScheduler();

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

// Internal control API consumed by the app container's HttpControl. Inputs are
// already validated by the app's zod routes, so this layer trusts them.
const server = createServer((req, res) => {
  void (async () => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname;
      const method = req.method ?? "GET";

      if (method === "GET" && path === "/ctl/health") return send(res, 200, { ok: true });

      if (method === "GET" && path === "/ctl/sessions") {
        return send(res, 200, { sessions: manager.list() });
      }
      const getOne = path.match(/^\/ctl\/sessions\/(.+)$/);
      if (method === "GET" && getOne) {
        const snap = manager.get(decodeURIComponent(getOne[1]!));
        return snap ? send(res, 200, snap) : send(res, 404, { error: "not_found" });
      }
      if (method === "POST" && path === "/ctl/spawn") {
        const cfg = (await readJson(req)) as SpawnConfig;
        try {
          const id = await manager.spawn(cfg);
          return send(res, 200, { id });
        } catch (err) {
          return send(res, 500, { error: err instanceof Error ? err.message : String(err) });
        }
      }
      const killM = path.match(/^\/ctl\/kill\/(.+)$/);
      if (method === "POST" && killM) {
        const ok = await manager.kill(decodeURIComponent(killM[1]!));
        return send(res, 200, { ok });
      }
      const forkM = path.match(/^\/ctl\/fork\/(.+)$/);
      if (method === "POST" && forkM) {
        const { prompt } = (await readJson(req)) as { prompt?: string };
        const id = await manager.fork(decodeURIComponent(forkM[1]!), prompt ?? "continue");
        return id ? send(res, 200, { id }) : send(res, 404, { error: "not_found" });
      }
      const effortM = path.match(/^\/ctl\/effort\/(.+)$/);
      if (method === "POST" && effortM) {
        const { effort } = (await readJson(req)) as { effort: Effort };
        const ok = manager.setEffort(decodeURIComponent(effortM[1]!), effort);
        return send(res, 200, { ok });
      }
      const approveM = path.match(/^\/ctl\/approve\/(.+)$/);
      if (method === "POST" && approveM) {
        const { toolUseId, allow } = (await readJson(req)) as { toolUseId: string; allow: boolean };
        const ok = manager.approve(decodeURIComponent(approveM[1]!), toolUseId, allow);
        return send(res, 200, { ok });
      }
      send(res, 404, { error: "unknown_route" });
    } catch (err) {
      send(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  })();
});

attachWebSocket(server);

server.listen(port, () => {
  log.info("orchestrator listening", { port, mock: process.env.COCKPIT_MOCK === "1" });
});
