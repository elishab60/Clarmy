import type { Effort, SessionSnapshot, SpawnConfig } from "../shared/types.ts";
import { getManager } from "./manager.ts";
import { role, orchestratorUrl } from "./role.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("control");

// The session operations the Next API routes need. Async so the same surface
// works whether sessions live in-process (solo/orchestrator) or behind HTTP
// in a separate orchestrator container (app role).
export interface SessionControl {
  list(): Promise<SessionSnapshot[]>;
  get(id: string): Promise<SessionSnapshot | null>;
  spawn(config: SpawnConfig): Promise<string>;
  kill(id: string): Promise<boolean>;
  fork(id: string, prompt: string): Promise<string | null>;
  setEffort(id: string, effort: Effort): Promise<boolean>;
  approve(id: string, toolUseId: string, allow: boolean): Promise<boolean>;
}

// In-process: delegate straight to the singleton SessionManager.
class LocalControl implements SessionControl {
  async list(): Promise<SessionSnapshot[]> { return getManager().list(); }
  async get(id: string): Promise<SessionSnapshot | null> { return getManager().get(id); }
  async spawn(config: SpawnConfig): Promise<string> { return getManager().spawn(config); }
  async kill(id: string): Promise<boolean> { return getManager().kill(id); }
  async fork(id: string, prompt: string): Promise<string | null> { return getManager().fork(id, prompt); }
  async setEffort(id: string, effort: Effort): Promise<boolean> { return getManager().setEffort(id, effort); }
  async approve(id: string, toolUseId: string, allow: boolean): Promise<boolean> {
    return getManager().approve(id, toolUseId, allow);
  }
}

// App role: talk to the orchestrator daemon over its internal control API.
class HttpControl implements SessionControl {
  private base = orchestratorUrl().replace(/\/$/, "");

  private async req<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T }> {
    const res = await fetch(`${this.base}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    const body = (text ? JSON.parse(text) : {}) as T;
    return { status: res.status, body };
  }

  async list(): Promise<SessionSnapshot[]> {
    try {
      const { body } = await this.req<{ sessions: SessionSnapshot[] }>("/ctl/sessions");
      return body.sessions ?? [];
    } catch (e) { log.warn("orchestrator list failed", { err: String(e) }); return []; }
  }

  async get(id: string): Promise<SessionSnapshot | null> {
    const { status, body } = await this.req<SessionSnapshot>(`/ctl/sessions/${encodeURIComponent(id)}`);
    return status === 200 ? body : null;
  }

  async spawn(config: SpawnConfig): Promise<string> {
    const { status, body } = await this.req<{ id?: string; error?: string }>("/ctl/spawn", {
      method: "POST",
      body: JSON.stringify(config),
    });
    if (status !== 200 || !body.id) throw new Error(body.error ?? `orchestrator spawn failed (${status})`);
    return body.id;
  }

  async kill(id: string): Promise<boolean> {
    const { body } = await this.req<{ ok: boolean }>(`/ctl/kill/${encodeURIComponent(id)}`, { method: "POST" });
    return body.ok ?? false;
  }

  async fork(id: string, prompt: string): Promise<string | null> {
    const { status, body } = await this.req<{ id?: string }>(`/ctl/fork/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ prompt }),
    });
    return status === 200 && body.id ? body.id : null;
  }

  async setEffort(id: string, effort: Effort): Promise<boolean> {
    const { body } = await this.req<{ ok: boolean }>(`/ctl/effort/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ effort }),
    });
    return body.ok ?? false;
  }

  async approve(id: string, toolUseId: string, allow: boolean): Promise<boolean> {
    const { body } = await this.req<{ ok: boolean }>(`/ctl/approve/${encodeURIComponent(id)}`, {
      method: "POST",
      body: JSON.stringify({ toolUseId, allow }),
    });
    return body.ok ?? false;
  }
}

let cached: SessionControl | null = null;

export function getControl(): SessionControl {
  if (cached) return cached;
  cached = role() === "app" ? new HttpControl() : new LocalControl();
  return cached;
}
