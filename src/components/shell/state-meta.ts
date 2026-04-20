import type { SessionState } from "@/lib/shared/types";

export const STATE_META: Record<SessionState, { label: string; color: string; cssVar: string }> = {
  running: { label: "running", color: "#eab308", cssVar: "var(--state-working)" },
  tool_use: { label: "tool use", color: "#eab308", cssVar: "var(--state-working)" },
  approval: { label: "approval", color: "#ef4444", cssVar: "var(--state-waiting)" },
  error: { label: "error", color: "#ef4444", cssVar: "var(--state-error)" },
  idle: { label: "waiting", color: "#22c55e", cssVar: "var(--state-done)" },
  done: { label: "done", color: "#22c55e", cssVar: "var(--state-done)" },
};

export const STATE_ORDER: readonly SessionState[] = ["running", "tool_use", "approval", "error", "idle", "done"];
