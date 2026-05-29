// Shared shapes for the cockpit MCP tools. Inputs are validated with zod inside
// each handler; `inputSchema` is the hand-written JSON Schema advertised over
// tools/list (kept dependency-free, in sync with the zod validator).

export interface ToolContext {
  // The calling session's cockpit id (from the x-cockpit-session header), or
  // null when the caller did not identify itself (still allowed to read state).
  readonly sessionId: string | null;
}

export interface ToolResult {
  readonly content: ReadonlyArray<{ readonly type: "text"; readonly text: string }>;
  readonly isError?: boolean;
}

export interface ToolDef {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  handle(args: unknown, ctx: ToolContext): Promise<ToolResult>;
}

// JSON content block, the only output type the prototype emits.
export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}
