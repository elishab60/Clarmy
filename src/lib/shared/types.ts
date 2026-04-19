export type SessionState =
  | "idle"
  | "running"
  | "tool_use"
  | "approval"
  | "error"
  | "done";

export type ModelId = "opus-4.7" | "sonnet-4.6" | "haiku-4.5";

export type ApprovalMode = "auto" | "prompt" | "strict";

export type LogKind = "plain" | "gt" | "muted" | "ok" | "warn";

export interface LogLine {
  readonly t: LogKind;
  readonly v: string;
}

export interface TodoItem {
  readonly status: "done" | "active" | "todo";
  readonly text: string;
}

export interface DiffRow {
  readonly type: "add" | "del" | "ctx";
  readonly ln: string;
  readonly txt: string;
}

export interface PendingApproval {
  readonly toolUseId: string;
  readonly tool: string;
  readonly args: Readonly<Record<string, unknown>>;
  readonly destructive: boolean;
}

export interface SessionSnapshot {
  readonly id: string;
  readonly project: string;
  readonly name: string;
  readonly model: ModelId;
  readonly state: SessionState;
  readonly tool: string | null;
  readonly elapsed: string;
  readonly toolsUsed: number;
  readonly todos: number;
  readonly todosDone: number;
  readonly cost: number;
  readonly startedAt: number;
  readonly logs: readonly LogLine[];
  readonly cwd?: string;
  readonly branch?: string;
  readonly prompt?: string;
  readonly endedAt?: number;
  readonly durationMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly todoList?: readonly TodoItem[];
  readonly editPath?: string;
  readonly diff?: readonly DiffRow[];
  readonly approval?: PendingApproval;
  readonly error?: string;
  readonly retryIn?: number;
  readonly summary?: string;
  readonly artifacts?: readonly string[];
}


export interface SpawnConfig {
  readonly project: string;
  readonly cwd: string;
  readonly name: string;
  readonly model: ModelId;
  readonly prompt: string;
  readonly allowedTools: readonly string[];
  readonly approvalMode: ApprovalMode;
  readonly branch?: string;
  readonly dangerouslySkipPermissions?: boolean;
  readonly resumeSessionId?: string;
}

export type SessionEvent =
  | { kind: "init"; at: number; snapshot: SessionSnapshot }
  | { kind: "patch"; at: number; id: string; patch: Partial<SessionSnapshot> }
  | { kind: "log"; at: number; id: string; line: LogLine }
  | { kind: "transition"; at: number; id: string; from: SessionState; to: SessionState }
  | { kind: "gone"; at: number; id: string };
