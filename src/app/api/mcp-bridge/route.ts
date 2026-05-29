import { NextResponse } from "next/server";
import { dispatch } from "@/lib/mcp/protocol";
import { contextFromHeaders, isAuthorized } from "@/lib/mcp/http";
import { KEY_HEADER } from "@/lib/mcp/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streamable-HTTP MCP endpoint piloted sessions connect to in solo / app role.
// The manager and message bus live in this same Next process (solo) so the
// tools act on the live world directly.
export async function POST(req: Request) {
  const get = (name: string) => req.headers.get(name);
  if (!isAuthorized(get(KEY_HEADER))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const result = await dispatch(payload, contextFromHeaders(get));
  if (result.body === null) return new NextResponse(null, { status: result.status });
  return NextResponse.json(result.body, { status: result.status });
}
