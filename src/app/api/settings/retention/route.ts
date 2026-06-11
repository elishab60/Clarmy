import { NextResponse } from "next/server";
import { readRetention, makeHistoryPersistent } from "@/lib/claude-code/retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(readRetention());
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// One-shot action, no body: pin cleanupPeriodDays to the persistent value.
export async function POST() {
  try {
    return NextResponse.json({ ok: true, ...makeHistoryPersistent() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
