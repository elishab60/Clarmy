import type { SessionSnapshot, SessionState, LogLine, TodoItem, DiffRow, PendingApproval } from "../shared/types.ts";

export type StateAction =
  | { type: "system.init"; id: string; provider: SessionSnapshot["provider"]; project: string; name: string; model: SessionSnapshot["model"]; startedAt: number; cwd?: string; branch?: string; prompt?: string; effort?: SessionSnapshot["effort"] }
  | { type: "assistant.text"; line: LogLine }
  | { type: "assistant.tool_use"; tool: string; editPath?: string; diff?: DiffRow[] }
  | { type: "pre_tool_use.approval"; approval: PendingApproval }
  | { type: "approval.resolved"; allow: boolean }
  | { type: "post_tool_use" }
  | { type: "todo.update"; items: TodoItem[] }
  | { type: "result.success"; summary?: string; artifacts?: string[]; cost: number; durationMs?: number; inputTokens?: number; outputTokens?: number }
  | { type: "result.error"; message: string; retryIn?: number; durationMs?: number; inputTokens?: number; outputTokens?: number; cost?: number }
  | { type: "cost.update"; delta: number }
  | { type: "usage.update"; cost: number; inputTokens: number; outputTokens: number }
  | { type: "user.prompt"; line: LogLine }
  | { type: "tool.reset" };

export function initialSnapshot(init: Extract<StateAction, { type: "system.init" }>): SessionSnapshot {
  return {
    id: init.id,
    provider: init.provider,
    project: init.project,
    name: init.name,
    model: init.model,
    state: "running",
    tool: null,
    elapsed: "00:00",
    toolsUsed: 0,
    todos: 0,
    todosDone: 0,
    cost: 0,
    startedAt: init.startedAt,
    logs: [],
    cwd: init.cwd,
    branch: init.branch,
    prompt: init.prompt,
    effort: init.effort,
  };
}

export function reduce(s: SessionSnapshot, a: StateAction): SessionSnapshot {
  switch (a.type) {
    case "system.init":
      return initialSnapshot(a);

    case "assistant.text":
      return { ...s, logs: appendLog(s.logs, a.line) };

    case "assistant.tool_use":
      return {
        ...s,
        state: "tool_use",
        tool: a.tool,
        toolsUsed: s.toolsUsed + 1,
        editPath: a.editPath ?? s.editPath,
        diff: a.diff ?? s.diff,
      };

    case "pre_tool_use.approval":
      return { ...s, state: "approval", tool: a.approval.tool, approval: a.approval };

    case "approval.resolved":
      return {
        ...s,
        state: a.allow ? "tool_use" : "idle",
        approval: undefined,
        tool: a.allow ? s.tool : null,
      };

    case "post_tool_use":
      return { ...s, state: "running", tool: null, diff: undefined, editPath: undefined };

    case "todo.update": {
      const done = a.items.filter((t) => t.status === "done").length;
      return { ...s, todoList: a.items, todos: a.items.length, todosDone: done };
    }

    case "result.success": {
      const endedAt = Date.now();
      return {
        ...s,
        state: "done",
        tool: null,
        summary: a.summary,
        artifacts: a.artifacts,
        cost: a.cost,
        endedAt,
        durationMs: a.durationMs ?? endedAt - s.startedAt,
        inputTokens: a.inputTokens ?? s.inputTokens,
        outputTokens: a.outputTokens ?? s.outputTokens,
      };
    }

    case "result.error": {
      const endedAt = Date.now();
      return {
        ...s,
        state: "error",
        error: a.message,
        retryIn: a.retryIn,
        endedAt,
        durationMs: a.durationMs ?? endedAt - s.startedAt,
        cost: a.cost ?? s.cost,
        inputTokens: a.inputTokens ?? s.inputTokens,
        outputTokens: a.outputTokens ?? s.outputTokens,
      };
    }

    case "cost.update":
      return { ...s, cost: s.cost + a.delta };

    case "usage.update":
      return { ...s, cost: a.cost, inputTokens: a.inputTokens, outputTokens: a.outputTokens };

    case "user.prompt":
      return { ...s, state: "running", logs: appendLog(s.logs, a.line) };

    case "tool.reset":
      return { ...s, tool: null, diff: undefined, editPath: undefined };
  }
}

function appendLog(logs: readonly LogLine[], line: LogLine): readonly LogLine[] {
  const next = logs.length >= 500 ? logs.slice(logs.length - 499) : logs.slice();
  next.push(line);
  return next;
}

const STATES: readonly SessionState[] = ["idle", "running", "tool_use", "approval", "error", "done"];
export function isValidState(v: string): v is SessionState {
  return (STATES as readonly string[]).includes(v);
}
