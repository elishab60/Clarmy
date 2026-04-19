import { NextResponse } from "next/server";
import { readMcpServers } from "@/lib/claude-code/mcp-config";
import { probeMcpServer } from "@/lib/claude-code/mcp-probe";
import { scanMcpCalls, aggregateByServer } from "@/lib/claude-code/mcp-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { enabled, disabled } = readMcpServers();
  const cfg = enabled[id] ?? disabled[id];
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  const probe = await probeMcpServer(id, cfg).catch(() => null);
  const agg = aggregateByServer(scanMcpCalls()).get(id);
  const names = probe?.tools ?? Array.from(agg?.tools.keys() ?? []);
  const tools = names.map((n) => ({
    name: n,
    callCount: agg?.tools.get(n)?.count ?? 0,
    lastTs: agg?.tools.get(n)?.lastTs ?? null,
  }));
  return NextResponse.json({ tools, probeOk: probe?.ok ?? false, probeError: probe?.error, skipped: probe?.skipped });
}
