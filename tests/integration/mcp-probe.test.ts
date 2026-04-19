import { describe, it, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { probeMcpServer } from "../../src/lib/claude-code/mcp-probe.ts";

const STUB = `
let buf = "";
process.stdin.on("data", (d) => {
  buf += String(d);
  let idx;
  while ((idx = buf.indexOf("\\n")) >= 0) {
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    try {
      const r = JSON.parse(line);
      if (r.method === "initialize") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: { capabilities: { tools: {} } } }) + "\\n");
      } else if (r.method === "tools/list") {
        process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: r.id, result: { tools: [{ name: "echo" }, { name: "ping" }] } }) + "\\n");
      }
    } catch {}
  }
});
`;

describe("probeMcpServer", () => {
  it("returns tools from stub server", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-stub-"));
    const stub = join(dir, "stub.mjs");
    writeFileSync(stub, STUB);
    const res = await probeMcpServer(
      "stub",
      { command: process.execPath, args: [stub] },
      { bypassCache: true, timeoutMs: 3000 },
    );
    expect(res.ok).toBe(true);
    expect(res.tools).toEqual(expect.arrayContaining(["echo", "ping"]));
  });

  it("skips non-stdio transports", async () => {
    const res = await probeMcpServer(
      "sse",
      { command: "x", transport: "sse" },
      { bypassCache: true },
    );
    expect(res.skipped).toBe(true);
  });
});
