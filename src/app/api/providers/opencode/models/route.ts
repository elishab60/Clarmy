import { NextResponse } from "next/server";
import { listOpenCodeModels } from "@/lib/providers/opencode/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The user's selectable opencode models (default + plan + authed), discovered
// from `opencode models`. Powers the searchable model picker in new-session.
export function GET() {
  return NextResponse.json({ models: listOpenCodeModels() });
}
