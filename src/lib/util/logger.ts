type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function currentLevel(): Level {
  const raw = process.env.COCKPIT_LOG_LEVEL ?? (process.env.NODE_ENV === "production" ? "info" : "debug");
  return (["debug", "info", "warn", "error"] as const).includes(raw as Level) ? (raw as Level) : "info";
}

function shouldLog(level: Level): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

function emit(level: Level, scope: string, msg: string, data?: unknown): void {
  if (!shouldLog(level)) return;
  const ts = new Date().toISOString();
  const line = data === undefined
    ? `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`
    : `${ts} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg} ${safeJson(data)}`;
  const stream = level === "error" || level === "warn" ? process.stderr : process.stdout;
  stream.write(line + "\n");
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); }
  catch { return "[unserializable]"; }
}

export interface Logger {
  debug: (msg: string, data?: unknown) => void;
  info: (msg: string, data?: unknown) => void;
  warn: (msg: string, data?: unknown) => void;
  error: (msg: string, data?: unknown) => void;
}

export function createLogger(scope: string): Logger {
  return {
    debug: (m, d) => emit("debug", scope, m, d),
    info: (m, d) => emit("info", scope, m, d),
    warn: (m, d) => emit("warn", scope, m, d),
    error: (m, d) => emit("error", scope, m, d),
  };
}
