import { NextResponse } from "next/server";
import { z } from "zod";
import { readMcpServers } from "@/lib/claude-code/mcp-config";
import { probeMcpServer } from "@/lib/claude-code/mcp-probe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ serverId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { enabled, disabled } = readMcpServers();
  const cfg = enabled[parsed.data.serverId] ?? disabled[parsed.data.serverId];
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  const result = await probeMcpServer(parsed.data.serverId, cfg, { bypassCache: true });
  return NextResponse.json(result);
}
