import type { IncomingMessage, ServerResponse } from "node:http";
import { createLogger } from "../util/logger.ts";
import { dispatch } from "./protocol.ts";
import { mcpKey, SESSION_HEADER, KEY_HEADER } from "./config.ts";
import type { ToolContext } from "./tools/types.ts";

const log = createLogger("mcp.http");

export function isAuthorized(presentedKey: string | null): boolean {
  return presentedKey === mcpKey();
}

// Build the tool context from a header lookup function (works for both the Web
// `Headers` API and node's `IncomingMessage.headers`).
export function contextFromHeaders(get: (name: string) => string | null): ToolContext {
  const sid = get(SESSION_HEADER);
  return { sessionId: sid && sid.length > 0 ? sid : null };
}

function headerGetter(req: IncomingMessage): (name: string) => string | null {
  return (name) => {
    const v = req.headers[name.toLowerCase()];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  if (body === null) {
    res.writeHead(status);
    res.end();
    return;
  }
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

// node:http handler for the orchestrator daemon's POST /mcp route. Returns true
// if it handled the request (method/path matched).
export async function handleMcpHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const get = headerGetter(req);
  if ((req.method ?? "GET") !== "POST") {
    sendJson(res, 405, { error: "method_not_allowed" });
    return;
  }
  if (!isAuthorized(get(KEY_HEADER))) {
    sendJson(res, 401, { error: "unauthorized" });
    return;
  }
  let payload: unknown;
  try {
    payload = await readBody(req);
  } catch {
    sendJson(res, 400, { error: "invalid_json" });
    return;
  }
  try {
    const result = await dispatch(payload, contextFromHeaders(get));
    sendJson(res, result.status, result.body);
  } catch (err) {
    log.error("dispatch failed", { err: String(err) });
    sendJson(res, 500, { error: "internal_error" });
  }
}
