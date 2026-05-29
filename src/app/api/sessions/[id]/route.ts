import { NextResponse } from "next/server";
import { z } from "zod";
import { getControl } from "@/lib/orchestrator/control";
import { ALL_EFFORTS } from "@/lib/shared/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("fork"),
    prompt: z.string().min(1).max(50_000).optional(),
  }),
  z.object({
    action: z.literal("set_effort"),
    effort: z.enum(ALL_EFFORTS),
  }),
]);

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const snap = await getControl().get(id);
  if (!snap) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(snap);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await getControl().kill(id);
  return NextResponse.json({ ok });
}

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = ActionSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (parsed.data.action === "fork") {
    const next = await getControl().fork(id, parsed.data.prompt ?? "continue");
    if (!next) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ id: next }, { status: 201 });
  }
  if (parsed.data.action === "set_effort") {
    const ok = await getControl().setEffort(id, parsed.data.effort);
    if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
