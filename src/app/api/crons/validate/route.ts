import { NextResponse } from "next/server";
import { z } from "zod";
import { validateCronExpression, computeNextFire } from "@/lib/orchestrator/cron-scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({
  expression: z.string().min(1).max(120),
  count: z.number().int().min(1).max(10).default(5),
});

export async function POST(req: Request) {
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  const v = validateCronExpression(parsed.data.expression);
  if (!v.ok) return NextResponse.json({ ok: false, error: v.error });
  const upcoming: string[] = [];
  let from = new Date();
  for (let i = 0; i < parsed.data.count; i++) {
    const next = computeNextFire({ kind: "recurring", expression: parsed.data.expression }, from);
    if (!next) break;
    upcoming.push(next.toISOString());
    from = new Date(next.getTime() + 60_000);
  }
  return NextResponse.json({ ok: true, upcoming });
}
