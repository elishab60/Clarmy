import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.COCKPIT_MOCK = "1";
process.env.COCKPIT_MCP_KEY = "verify-key";
process.env.COCKPIT_CLAUDE_HOME = mkdtempSync(join(tmpdir(), "cockpit-verify-"));

const { dispatch } = await import("../src/lib/mcp/protocol.ts");
const { isAuthorized } = await import("../src/lib/mcp/http.ts");
const { mcpKey } = await import("../src/lib/mcp/config.ts");

let pass = 0, fail = 0;
function check(label: string, cond: boolean): void {
  if (cond) { pass++; process.stdout.write(`ok   ${label}\n`); }
  else { fail++; process.stdout.write(`FAIL ${label}\n`); }
}

async function call(name: string, args: unknown, sessionId: string | null = null): Promise<{ result: any; isError: boolean }> {
  const res = await dispatch({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, { sessionId });
  const body = res.body as { result?: { content: { text: string }[]; isError?: boolean } };
  return { result: JSON.parse(body.result?.content?.[0]?.text ?? "null"), isError: body.result?.isError ?? false };
}

const init = await dispatch({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { sessionId: null });
check("initialize -> cockpit", (init.body as any).result.serverInfo.name === "cockpit");

const list = await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { sessionId: null });
check("tools/list has 10 tools", (list.body as any).result.tools.length === 10);

const notif = await dispatch({ jsonrpc: "2.0", method: "notifications/initialized" }, { sessionId: null });
check("notification -> 202 null", notif.status === 202 && notif.body === null);

check("auth ok with key", isAuthorized(mcpKey()) === true);
check("auth rejects bad key", isAuthorized("nope") === false);

const a = (await call("spawn_session", { project: "demo", cwd: process.cwd(), name: "A", model: "opus-4.8", prompt: "hi" })).result.id as string;
const b = (await call("spawn_session", { project: "demo", cwd: process.cwd(), name: "B", model: "opus-4.8", prompt: "hi" })).result.id as string;
check("spawn A", typeof a === "string" && a.startsWith("s_"));
check("spawn B", typeof b === "string" && b.startsWith("s_"));

const listed = (await call("list_sessions", {})).result;
check("list_sessions contains A and B", listed.sessions.some((s: any) => s.id === a) && listed.sessions.some((s: any) => s.id === b));

const got = (await call("get_session", { id: a })).result;
check("get_session A", got.id === a);
check("get_session unknown -> error", (await call("get_session", { id: "zzz" })).isError === true);

const sent = await call("send_message", { to: b, text: "ping" }, a);
check("send_message delivered", sent.result.delivered === true);
const read = (await call("read_messages", {}, b)).result;
check("read_messages B drains 1 from A", read.count === 1 && read.messages[0].from === a && read.messages[0].text === "ping");
check("read_messages B empty after drain", (await call("read_messages", {}, b)).result.count === 0);

const bc = await call("broadcast", { text: "all" }, a);
check("broadcast delivered >=1", bc.result.delivered >= 1);
check("broadcast reached B", (await call("read_messages", {}, b)).result.count >= 1);
check("broadcast excluded sender A", (await call("read_messages", {}, a)).result.count === 0);

const cron = (await call("create_cron", { name: "nightly", schedule: { kind: "recurring", expression: "0 3 * * *" }, spawn: { project: "demo", cwd: process.cwd(), name: "run", model: "opus-4.8", prompt: "go" } }));
check("create_cron returns id + nextFireAt", cron.result.id?.startsWith("c_") && !!cron.result.nextFireAt);
check("create_cron bad expr -> error", (await call("create_cron", { name: "x", schedule: { kind: "recurring", expression: "bad" }, spawn: { project: "d", cwd: process.cwd(), name: "n", model: "opus-4.8", prompt: "p" } })).isError === true);
const crons = (await call("list_crons", {})).result;
check("list_crons has the job", crons.jobs.some((j: any) => j.id === cron.result.id));

const sum = (await call("summarize_all", { includeCrons: true })).result;
check("summarize_all totals.sessions > 0", sum.totals.sessions > 0);
check("summarize_all includes crons", Array.isArray(sum.crons) && sum.crons.length > 0);

check("kill_session A", (await call("kill_session", { id: a })).result.ok === true);

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
