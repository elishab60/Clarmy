import { NextResponse } from "next/server";
import { scanAll } from "@/lib/claude-code/history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 300, 1), 2000);
  const cwd = url.searchParams.get("cwd");
  let sessions = scanAll();
  if (cwd) sessions = sessions.filter((s) => s.cwd === cwd);
  const trimmed = sessions.slice(0, limit).map(({ usage: _usage, ...rest }) => rest);
  return NextResponse.json({ sessions: trimmed });
}
