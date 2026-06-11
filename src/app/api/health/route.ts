import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getControl } from "@/lib/orchestrator/control";
import { role } from "@/lib/orchestrator/role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const startedAt = Date.now();

function version(): string {
  try {
    return (JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string }).version ?? "0.0.0";
  } catch { return "0.0.0"; }
}

// Cheap liveness + a glance of the world: used by bin/clarmy's startup gate
// and anything that wants to monitor the daemon. Never touches the network.
export async function GET() {
  try {
    const sessions = await getControl().list();
    return NextResponse.json({
      ok: true,
      version: version(),
      role: role(),
      uptimeMs: Date.now() - startedAt,
      sessions: sessions.length,
      mock: process.env.COCKPIT_MOCK === "1",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
