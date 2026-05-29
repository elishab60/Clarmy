import { NextResponse } from "next/server";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanAgents, readAgentBody } from "@/lib/claude-code/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd") ?? undefined;
  const agent = scanAgents(scanInstalledPlugins(), cwd).find((a) => a.id === id);
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!agent.path) return NextResponse.json({ body: "", readOnly: true, builtin: true });
  const body = readAgentBody(agent.path);
  if (body == null) return NextResponse.json({ error: "unreadable" }, { status: 500 });
  return NextResponse.json({ body, readOnly: !agent.editable });
}
