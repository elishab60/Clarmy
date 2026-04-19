import { NextResponse } from "next/server";
import { z } from "zod";
import { getManager } from "@/lib/orchestrator/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.object({
  action: z.enum(["fork"]),
  prompt: z.string().min(1).max(50_000).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const snap = getManager().get(id);
  if (!snap) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(snap);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await getManager().kill(id);
  return NextResponse.json({ ok });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = ActionSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (parsed.data.action === "fork") {
    const next = await getManager().fork(id, parsed.data.prompt ?? "continue");
    if (!next) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ id: next }, { status: 201 });
  }
  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
