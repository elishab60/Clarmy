import { sessionTools } from "./sessions.ts";
import { messagingTools } from "./messaging.ts";
import { cronTools } from "./crons.ts";
import { secretTools } from "./secrets.ts";
import { emailTools } from "./email.ts";
import { metricsTools } from "./metrics.ts";
import type { ToolDef } from "./types.ts";

export const ALL_TOOLS: readonly ToolDef[] = [
  ...sessionTools,
  ...messagingTools,
  ...cronTools,
  ...secretTools,
  ...emailTools,
  ...metricsTools,
];

const BY_NAME = new Map<string, ToolDef>(ALL_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ToolDef | null {
  return BY_NAME.get(name) ?? null;
}

// Shape advertised over tools/list.
export function toolListEntries(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
  return ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));
}

export type { ToolDef, ToolContext, ToolResult } from "./types.ts";
