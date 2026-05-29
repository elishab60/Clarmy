import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dispatch } from "@/lib/mcp/protocol";
import { isAuthorized } from "@/lib/mcp/http";
import { mcpKey, buildSessionMcpConfig } from "@/lib/mcp/config";
import { getBus } from "@/lib/mcp/bus";
import type { ToolContext } from "@/lib/mcp/tools/types";

const MANAGER_KEY = Symbol.for("cockpit.session-manager");
const anonCtx: ToolContext = { sessionId: null };

// Drive a tools/call and return the parsed JSON the tool emitted.
async function call(name: string, args: unknown, ctx: ToolContext = anonCtx): Promise<{ result: unknown; isError: boolean }> {
  const res = await dispatch(
    { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    ctx,
  );
  const body = res.body as { result?: { content: { text: string }[]; isError?: boolean } };
  const content = body.result?.content?.[0]?.text ?? "null";
  let result: unknown = content;
  try { result = JSON.parse(content); } catch { /* error results are plain text */ }
  return { result, isError: body.result?.isError ?? false };
}

async function spawnMock(name: string): Promise<string> {
  const out = await call("spawn_session", {
    project: "demo", cwd: process.cwd(), name, model: "opus-4.8", prompt: "hello",
  });
  const r = out.result as { id?: string };
  expect(r.id, JSON.stringify(out.result)).toBeTruthy();
  return r.id as string;
}

let home: string;

describe("cockpit mcp server", () => {
  beforeAll(() => {
    home = mkdtempSync(join(tmpdir(), "cockpit-mcp-"));
    process.env.COCKPIT_CLAUDE_HOME = home;
    process.env.COCKPIT_MCP_KEY = "test-key-123";
    process.env.COCKPIT_MOCK = "1";
    // Force a fresh mock manager regardless of singleton state from other files.
    (globalThis as Record<symbol, unknown>)[MANAGER_KEY] = undefined;
  });

  afterAll(() => {
    if (home && existsSync(home)) rmSync(home, { recursive: true, force: true });
  });

  describe("protocol", () => {
    it("initialize returns the cockpit server info", async () => {
      const res = await dispatch({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, anonCtx);
      const body = res.body as { result: { serverInfo: { name: string }; capabilities: { tools: unknown } } };
      expect(res.status).toBe(200);
      expect(body.result.serverInfo.name).toBe("cockpit");
      expect(body.result.capabilities.tools).toBeDefined();
    });

    it("notifications get 202 with no body", async () => {
      const res = await dispatch({ jsonrpc: "2.0", method: "notifications/initialized" }, anonCtx);
      expect(res.status).toBe(202);
      expect(res.body).toBeNull();
    });

    it("tools/list advertises every tool", async () => {
      const res = await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" }, anonCtx);
      const body = res.body as { result: { tools: { name: string }[] } };
      const names = body.result.tools.map((t) => t.name);
      expect(names).toEqual(expect.arrayContaining([
        "list_sessions", "get_session", "summarize_all", "send_message",
        "broadcast", "read_messages", "spawn_session", "kill_session",
        "create_cron", "list_crons",
      ]));
    });

    it("unknown method returns -32601", async () => {
      const res = await dispatch({ jsonrpc: "2.0", id: 3, method: "does/not/exist" }, anonCtx);
      const body = res.body as { error?: { code: number } };
      expect(body.error?.code).toBe(-32601);
    });
  });

  describe("auth + config", () => {
    it("isAuthorized matches the shared key", () => {
      expect(isAuthorized(mcpKey())).toBe(true);
      expect(isAuthorized("wrong")).toBe(false);
      expect(isAuthorized(null)).toBe(false);
    });

    it("session config embeds id + key as http headers", () => {
      const cfg = buildSessionMcpConfig("s_demo");
      const entry = cfg.mcpServers.cockpit!;
      expect(entry.type).toBe("http");
      expect(entry.headers["x-cockpit-session"]).toBe("s_demo");
      expect(entry.headers["x-cockpit-mcp-key"]).toBe(mcpKey());
    });
  });

  describe("sessions", () => {
    it("spawn -> list -> get round trips", async () => {
      const id = await spawnMock("alpha");
      const list = (await call("list_sessions", {})).result as { count: number; sessions: { id: string }[] };
      expect(list.sessions.some((s) => s.id === id)).toBe(true);
      const got = (await call("get_session", { id })).result as { id: string; name: string };
      expect(got.id).toBe(id);
      const missing = await call("get_session", { id: "nope" });
      expect(missing.isError).toBe(true);
    });

    it("summarize_all rolls up totals and crons", async () => {
      const res = (await call("summarize_all", { includeCrons: true })).result as {
        totals: { sessions: number }; stateCounts: Record<string, number>; crons: unknown[];
      };
      expect(res.totals.sessions).toBeGreaterThan(0);
      expect(Array.isArray(res.crons)).toBe(true);
    });
  });

  describe("messaging", () => {
    beforeEach(() => {
      getBus().forget("s_a");
      getBus().forget("s_b");
    });

    it("send + read drains the recipient inbox", async () => {
      const a = await spawnMock("sender");
      const b = await spawnMock("receiver");
      const sent = await call("send_message", { to: b, text: "ping from a" }, { sessionId: a });
      expect((sent.result as { delivered: boolean }).delivered).toBe(true);
      const read = (await call("read_messages", {}, { sessionId: b })).result as {
        count: number; messages: { from: string; text: string }[];
      };
      expect(read.count).toBe(1);
      expect(read.messages[0]!.text).toBe("ping from a");
      expect(read.messages[0]!.from).toBe(a);
      const again = (await call("read_messages", {}, { sessionId: b })).result as { count: number };
      expect(again.count).toBe(0);
    });

    it("broadcast reaches every other session", async () => {
      const a = await spawnMock("broadcaster");
      const b = await spawnMock("peer-b");
      const out = (await call("broadcast", { text: "hello all" }, { sessionId: a })).result as { delivered: number };
      expect(out.delivered).toBeGreaterThanOrEqual(1);
      const readB = (await call("read_messages", {}, { sessionId: b })).result as { count: number };
      expect(readB.count).toBeGreaterThanOrEqual(1);
      const readA = (await call("read_messages", {}, { sessionId: a })).result as { count: number };
      expect(readA.count).toBe(0); // sender excluded
    });

    it("read without a session id errors", async () => {
      const res = await call("read_messages", {}, anonCtx);
      expect(res.isError).toBe(true);
    });
  });

  describe("crons", () => {
    it("create_cron (recurring) persists and lists", async () => {
      const created = (await call("create_cron", {
        name: "nightly", schedule: { kind: "recurring", expression: "0 3 * * *" },
        spawn: { project: "demo", cwd: process.cwd(), name: "nightly run", model: "opus-4.8", prompt: "do it" },
      })).result as { id: string; nextFireAt?: string };
      expect(created.id).toMatch(/^c_/);
      expect(created.nextFireAt).toBeTruthy();
      const list = (await call("list_crons", {})).result as { jobs: { id: string }[] };
      expect(list.jobs.some((j) => j.id === created.id)).toBe(true);
      expect(existsSync(join(home, "cockpit", "crons.json"))).toBe(true);
      const onDisk = JSON.parse(readFileSync(join(home, "cockpit", "crons.json"), "utf8")) as { jobs: unknown[] };
      expect(onDisk.jobs.length).toBeGreaterThan(0);
    });

    it("rejects an invalid cron expression", async () => {
      const res = await call("create_cron", {
        name: "bad", schedule: { kind: "recurring", expression: "not a cron" },
        spawn: { project: "demo", cwd: process.cwd(), name: "x", model: "opus-4.8", prompt: "p" },
      });
      expect(res.isError).toBe(true);
    });

    it("rejects a past oneshot time", async () => {
      const res = await call("create_cron", {
        name: "past", schedule: { kind: "oneshot", at: "2000-01-01T00:00:00.000Z" },
        spawn: { project: "demo", cwd: process.cwd(), name: "x", model: "opus-4.8", prompt: "p" },
      });
      expect(res.isError).toBe(true);
    });

    it("rejects an invalid oneshot date but accepts a future one", async () => {
      const bad = await call("create_cron", {
        name: "badtime", schedule: { kind: "oneshot", at: "not-a-date" },
        spawn: { project: "demo", cwd: process.cwd(), name: "x", model: "opus-4.8", prompt: "p" },
      });
      expect(bad.isError).toBe(true);
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const okRes = (await call("create_cron", {
        name: "future", schedule: { kind: "oneshot", at: future },
        spawn: { project: "demo", cwd: process.cwd(), name: "x", model: "opus-4.8", prompt: "p" },
      })).result as { id: string; nextFireAt?: string };
      expect(okRes.id).toMatch(/^c_/);
      expect(okRes.nextFireAt).toBe(future);
    });
  });

  describe("protocol negotiation + batch", () => {
    it("initialize echoes the requested protocol version, else defaults", async () => {
      const custom = await dispatch(
        { jsonrpc: "2.0", id: 9, method: "initialize", params: { protocolVersion: "2025-01-01" } }, anonCtx);
      const cBody = custom.body as { result: { protocolVersion: string } };
      expect(cBody.result.protocolVersion).toBe("2025-01-01");
      const def = await dispatch({ jsonrpc: "2.0", id: 9, method: "initialize", params: {} }, anonCtx);
      const dBody = def.body as { result: { protocolVersion: string } };
      expect(dBody.result.protocolVersion).toBe("2025-06-18");
    });

    it("a mixed batch drops notifications and flags invalid items", async () => {
      const res = await dispatch([
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { bad: true },
      ], anonCtx);
      expect(res.status).toBe(200);
      const arr = res.body as Array<{ id: unknown; result?: unknown; error?: { code: number } }>;
      expect(arr.length).toBe(2); // the notification yields no response
      expect(arr.some((r) => r.error?.code === -32600)).toBe(true);
      expect(arr.some((r) => r.result !== undefined)).toBe(true);
    });

    it("a batch of only notifications returns 202 with no body", async () => {
      const res = await dispatch([
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", method: "notifications/cancelled" },
      ], anonCtx);
      expect(res.status).toBe(202);
      expect(res.body).toBeNull();
    });
  });

  describe("messaging edge cases", () => {
    beforeEach(() => {
      getBus().forget("s_peek_dst");
      getBus().forget("s_overflow");
    });

    it("peek reads without draining; a real read drains", async () => {
      const a = await spawnMock("peek-src");
      const b = await spawnMock("peek-dst");
      await call("send_message", { to: b, text: "keep me" }, { sessionId: a });
      const peek1 = (await call("read_messages", { peek: true }, { sessionId: b })).result as { count: number };
      expect(peek1.count).toBe(1);
      const peek2 = (await call("read_messages", { peek: true }, { sessionId: b })).result as { count: number };
      expect(peek2.count).toBe(1); // still present after peek
      const drained = (await call("read_messages", {}, { sessionId: b })).result as { count: number };
      expect(drained.count).toBe(1);
      const after = (await call("read_messages", { peek: true }, { sessionId: b })).result as { count: number };
      expect(after.count).toBe(0);
    });

    it("send_message to an unknown session errors", async () => {
      const a = await spawnMock("lonely");
      const res = await call("send_message", { to: "s_does_not_exist", text: "hi" }, { sessionId: a });
      expect(res.isError).toBe(true);
      expect(String(res.result)).toContain("not_found");
    });

    it("the inbox is capped, dropping the oldest messages", () => {
      const bus = getBus();
      for (let i = 0; i < 105; i += 1) bus.send("s_src", "s_overflow", `msg-${i}`);
      const msgs = bus.read("s_overflow", true);
      expect(msgs.length).toBe(100);
      expect(msgs[0]!.text).toBe("msg-5"); // first 5 evicted
      expect(msgs[99]!.text).toBe("msg-104");
    });
  });

  describe("session control guards", () => {
    it("spawn_session rejects a missing or non-directory cwd", async () => {
      const missing = await call("spawn_session", {
        project: "p", cwd: "/no/such/dir/xyz", name: "x", model: "opus-4.8", prompt: "hi",
      });
      expect(missing.isError).toBe(true);
      expect(String(missing.result)).toContain("cwd_not_found");
      const notDir = await call("spawn_session", {
        project: "p", cwd: join(process.cwd(), "package.json"), name: "x", model: "opus-4.8", prompt: "hi",
      });
      expect(notDir.isError).toBe(true);
      expect(String(notDir.result)).toContain("cwd_not_directory");
    });

    it("kill_session refuses to kill the calling session", async () => {
      const res = await call("kill_session", { id: "s_self" }, { sessionId: "s_self" });
      expect(res.isError).toBe(true);
      expect(String(res.result)).toContain("refusing");
    });
  });
});
