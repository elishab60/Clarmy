import { NextResponse } from "next/server";
import { z } from "zod";
import { readMcpServers, addMcpServer } from "@/lib/claude-code/mcp-config";
import { scanMcpCalls, aggregateByServer } from "@/lib/claude-code/mcp-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const { enabled, disabled } = readMcpServers();
  const agg = aggregateByServer(scanMcpCalls());
  const toRow = (name: string, cfg: typeof enabled[string], status: "on" | "off") => {
    const s = agg.get(name);
    return {
      id: name,
      name,
      status,
      command: cfg.command,
      args: cfg.args ?? [],
      transport: cfg.transport ?? "stdio",
      timeoutMs: cfg.timeoutMs ?? 30000,
      envKeys: Object.keys(cfg.env ?? {}),
      callCount: s?.count ?? 0,
      okCount: s?.ok ?? 0,
      errCount: s?.err ?? 0,
      lastTs: s?.lastTs ?? null,
      toolCount: s?.tools.size ?? 0,
    };
  };
  const servers = [
    ...Object.entries(enabled).map(([k, v]) => toRow(k, v, "on")),
    ...Object.entries(disabled).map(([k, v]) => toRow(k, v, "off")),
  ];
  return NextResponse.json({ servers });
}

const AddBody = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_.-]+$/),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(["stdio", "sse", "websocket"]).optional(),
  timeoutMs: z.number().int().positive().max(600000).optional(),
  overwrite: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = AddBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const { name, overwrite, ...cfg } = parsed.data;
  try { addMcpServer(name, cfg, { overwrite }); }
  catch (err) {
    if ((err as { code?: string }).code === "EEXIST") return NextResponse.json({ error: "server exists" }, { status: 409 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
