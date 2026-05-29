import { createLogger } from "../util/logger.ts";
import { getTool, toolListEntries } from "./tools/index.ts";
import type { ToolContext } from "./tools/types.ts";

const log = createLogger("mcp.protocol");

const DEFAULT_PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = { name: "cockpit", version: "0.1.0" } as const;

type JsonValue = unknown;

interface JsonRpcRequest {
  readonly jsonrpc: "2.0";
  readonly id?: string | number | null;
  readonly method: string;
  readonly params?: JsonValue;
}

interface JsonRpcError {
  readonly code: number;
  readonly message: string;
  readonly data?: JsonValue;
}

interface JsonRpcResponse {
  readonly jsonrpc: "2.0";
  readonly id: string | number | null;
  readonly result?: JsonValue;
  readonly error?: JsonRpcError;
}

function isRequest(v: unknown): v is JsonRpcRequest {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return r.jsonrpc === "2.0" && typeof r.method === "string";
}

function ok(id: string | number | null, result: JsonValue): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function fail(id: string | number | null, code: number, message: string, data?: JsonValue): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, data } };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

// Handle one JSON-RPC message. Returns null for notifications (no id), which the
// transport should answer with 202 Accepted and an empty body.
async function handleOne(msg: JsonRpcRequest, ctx: ToolContext): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;
  const isNotification = msg.id === undefined || msg.id === null;

  switch (msg.method) {
    case "initialize": {
      const params = asRecord(msg.params);
      const requested = params.protocolVersion;
      const protocolVersion = typeof requested === "string" ? requested : DEFAULT_PROTOCOL_VERSION;
      return ok(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });
    }
    case "notifications/initialized":
    case "notifications/cancelled":
      return null;
    case "ping":
      return ok(id, {});
    case "tools/list":
      return ok(id, { tools: toolListEntries() });
    case "tools/call": {
      const params = asRecord(msg.params);
      const name = typeof params.name === "string" ? params.name : "";
      const tool = getTool(name);
      if (!tool) return fail(id, -32602, `unknown tool: ${name}`);
      try {
        const result = await tool.handle(params.arguments, ctx);
        return ok(id, result);
      } catch (err) {
        log.error("tool handler threw", { name, err: String(err) });
        return ok(id, {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        });
      }
    }
    default:
      if (isNotification) return null;
      return fail(id, -32601, `method not found: ${msg.method}`);
  }
}

export interface DispatchResult {
  readonly status: number;
  readonly body: JsonValue | null;
}

// Entry point for both transports. `payload` is the already-parsed JSON body
// (single message or a batch array). Returns the HTTP status and the body to
// serialize (null body => send 202 with no content).
export async function dispatch(payload: unknown, ctx: ToolContext): Promise<DispatchResult> {
  if (Array.isArray(payload)) {
    const responses: JsonRpcResponse[] = [];
    for (const item of payload) {
      if (!isRequest(item)) {
        responses.push(fail(null, -32600, "invalid request"));
        continue;
      }
      const res = await handleOne(item, ctx);
      if (res) responses.push(res);
    }
    return responses.length ? { status: 200, body: responses } : { status: 202, body: null };
  }
  if (!isRequest(payload)) {
    return { status: 200, body: fail(null, -32600, "invalid request") };
  }
  const res = await handleOne(payload, ctx);
  return res ? { status: 200, body: res } : { status: 202, body: null };
}
