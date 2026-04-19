import { NextResponse } from "next/server";
import { tailMcpLogs } from "@/lib/claude-code/mcp-logs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const lines = Math.min(Math.max(Number(url.searchParams.get("lines")) || 200, 1), 2000);
  return NextResponse.json({ lines: tailMcpLogs(id, lines) });
}
