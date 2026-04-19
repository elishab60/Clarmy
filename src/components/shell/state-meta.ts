import type { SessionState } from "@/lib/shared/types";

export const STATE_META: Record<SessionState, { label: string; color: string; cssVar: string }> = {
  running: { label: "running", color: "#4a9eff", cssVar: "var(--state-running)" },
  tool_use: { label: "tool use", color: "#a78bfa", cssVar: "var(--state-tool)" },
  approval: { label: "approval", color: "#f5a524", cssVar: "var(--state-approval)" },
  error: { label: "error", color: "#ef4444", cssVar: "var(--state-error)" },
  idle: { label: "idle", color: "#6b7280", cssVar: "var(--state-idle)" },
  done: { label: "done", color: "#22c55e", cssVar: "var(--state-done)" },
};

export const STATE_ORDER: readonly SessionState[] = ["running", "tool_use", "approval", "error", "idle", "done"];
