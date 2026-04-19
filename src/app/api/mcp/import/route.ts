import { NextResponse } from "next/server";
import { z } from "zod";
import { importMcpServers } from "@/lib/claude-code/mcp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  json: z.string().min(1),
  overwrite: z.boolean().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  let payload: unknown;
  try { payload = JSON.parse(parsed.data.json); } catch (err) { return NextResponse.json({ error: `invalid json: ${String(err)}` }, { status: 400 }); }
  const shape = z.object({ mcpServers: z.record(z.object({
    command: z.string(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    transport: z.enum(["stdio", "sse", "websocket"]).optional(),
  })) });
  const v = shape.safeParse(payload);
  if (!v.success) return NextResponse.json({ error: "missing mcpServers object" }, { status: 400 });
  const res = importMcpServers(v.data, { overwrite: parsed.data.overwrite });
  return NextResponse.json({ ok: true, ...res });
}
