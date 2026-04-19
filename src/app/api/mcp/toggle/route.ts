import { NextResponse } from "next/server";
import { z } from "zod";
import { toggleMcpServer } from "@/lib/claude-code/mcp-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ serverId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  try {
    const res = toggleMcpServer(parsed.data.serverId);
    return NextResponse.json({ ok: true, enabled: res.enabled });
  } catch (err) { return NextResponse.json({ error: String(err) }, { status: 404 }); }
}
