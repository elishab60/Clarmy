import { NextResponse } from "next/server";
import { readMcpServers, removeMcpServer } from "@/lib/claude-code/mcp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { enabled, disabled } = readMcpServers();
  const cfg = enabled[id] ?? disabled[id];
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id, enabled: Boolean(enabled[id]), config: cfg });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  removeMcpServer(id);
  return NextResponse.json({ ok: true });
}
