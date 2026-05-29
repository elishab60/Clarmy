// Deployment role for the cockpit process.
//   solo         - single process: Next + orchestrator together (native dev).
//   orchestrator - daemon that owns the SessionManager / PTYs (no Next).
//   app          - Next front-end that proxies to a remote orchestrator.
export type Role = "solo" | "app" | "orchestrator";

export function role(): Role {
  const r = process.env.COCKPIT_ROLE;
  if (r === "app" || r === "orchestrator") return r;
  return "solo";
}

// Where the app reaches the orchestrator (control HTTP + proxied WS).
export function orchestratorUrl(): string {
  return process.env.COCKPIT_ORCHESTRATOR_URL ?? "http://orchestrator:4010";
}

// Port the orchestrator daemon listens on (internal to the compose network).
export function orchestratorPort(): number {
  return Number(process.env.COCKPIT_ORCHESTRATOR_PORT ?? 4010);
}
