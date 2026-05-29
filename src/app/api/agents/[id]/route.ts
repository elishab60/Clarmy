import { NextResponse } from "next/server";
import { writeFileSync, unlinkSync } from "node:fs";
import { z } from "zod";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanAgents } from "@/lib/claude-code/agents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PutBody = z.object({ body: z.string().min(1).max(200_000) });

export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd") ?? undefined;
  const agent = scanAgents(scanInstalledPlugins(), cwd).find((a) => a.id === id);
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!agent.editable || !agent.path) return NextResponse.json({ error: "read-only" }, { status: 403 });

  let parsed: z.infer<typeof PutBody>;
  try { parsed = PutBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }

  try { writeFileSync(agent.path, parsed.body, "utf8"); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd") ?? undefined;
  const agent = scanAgents(scanInstalledPlugins(), cwd).find((a) => a.id === id);
  if (!agent) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!agent.editable || !agent.path) return NextResponse.json({ error: "read-only" }, { status: 403 });
  try { unlinkSync(agent.path); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
  return NextResponse.json({ ok: true });
}
