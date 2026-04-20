import { NextResponse } from "next/server";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("path") ?? "";
  if (!raw || raw.length > 500) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }
  const p = expandHome(raw);
  try {
    const s = statSync(p);
    return NextResponse.json({ exists: true, isDirectory: s.isDirectory(), resolved: p });
  } catch {
    return NextResponse.json({ exists: false, isDirectory: false, resolved: p });
  }
}

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return resolve(p);
}
