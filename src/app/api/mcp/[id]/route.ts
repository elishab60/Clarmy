import { NextResponse } from "next/server";
import { z } from "zod";
import { readMcpServers, removeMcpServer, addMcpServer } from "@/lib/claude-code/mcp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { enabled, disabled } = readMcpServers();
  const cfg = enabled[id] ?? disabled[id];
  if (!cfg) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ id, enabled: Boolean(enabled[id]), config: cfg });
}

const PutBody = z.object({
  command: z.string().min(1).optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  transport: z.enum(["stdio", "sse", "websocket"]).optional(),
  timeoutMs: z.number().int().positive().max(600000).optional(),
});

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { enabled, disabled } = readMcpServers();
  const existing = enabled[id] ?? disabled[id];
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  const parsed = PutBody.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const updated = { ...existing, ...parsed.data };
  try { addMcpServer(id, updated, { overwrite: true }); }
  catch (err) { return NextResponse.json({ error: String(err) }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  removeMcpServer(id);
  return NextResponse.json({ ok: true });
}
