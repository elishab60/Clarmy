import { NextResponse } from "next/server";
import { z } from "zod";
import { getManager } from "@/lib/orchestrator/manager";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  toolUseId: z.string().min(1).max(200),
  allow: z.boolean(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const ok = getManager().approve(id, parsed.data.toolUseId, parsed.data.allow);
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok });
}
