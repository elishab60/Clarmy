import { randomBytes } from "node:crypto";
import { createLogger } from "../util/logger.ts";

const log = createLogger("mcp.bus");

// One message dropped into a session's inbox by another session (or the user).
export interface BusMessage {
  readonly id: string;
  readonly from: string | null;
  readonly to: string | null; // null = broadcast fan-out target
  readonly text: string;
  readonly at: number;
}

const MAX_INBOX = 100;

// In-process mailbox. Lives in the manager-owning process so the MCP tools and
// the SessionManager see the same world. Pull model: a session retrieves its
// own messages via the read_messages tool; nothing is pushed into a live REPL.
export class MessageBus {
  private readonly inboxes = new Map<string, BusMessage[]>();
  private seq = 0;

  private nextId(): string {
    this.seq += 1;
    return `m_${this.seq.toString(36)}_${randomBytes(2).toString("hex")}`;
  }

  send(from: string | null, to: string, text: string): BusMessage {
    const msg: BusMessage = { id: this.nextId(), from, to, text, at: Date.now() };
    this.push(to, msg);
    log.debug("send", { from, to, id: msg.id });
    return msg;
  }

  // Fan out to every recipient id except the sender. Returns delivered count.
  broadcast(from: string | null, recipients: readonly string[], text: string): number {
    let delivered = 0;
    for (const to of recipients) {
      if (to === from) continue;
      this.push(to, { id: this.nextId(), from, to: null, text, at: Date.now() });
      delivered += 1;
    }
    log.debug("broadcast", { from, delivered });
    return delivered;
  }

  private push(to: string, msg: BusMessage): void {
    const box = this.inboxes.get(to) ?? [];
    box.push(msg);
    while (box.length > MAX_INBOX) box.shift();
    this.inboxes.set(to, box);
  }

  // Return the session's messages. drain=true clears the inbox afterwards.
  read(sessionId: string, drain: boolean): BusMessage[] {
    const box = this.inboxes.get(sessionId) ?? [];
    if (drain) this.inboxes.delete(sessionId);
    return [...box];
  }

  unreadCount(sessionId: string): number {
    return this.inboxes.get(sessionId)?.length ?? 0;
  }

  // Per-session pending counts, for summarize_all.
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, box] of this.inboxes) if (box.length) out[id] = box.length;
    return out;
  }

  forget(sessionId: string): void {
    this.inboxes.delete(sessionId);
  }
}

const SINGLETON_KEY = Symbol.for("cockpit.mcp.bus");
type Holder = { [k: symbol]: MessageBus | undefined };

export function getBus(): MessageBus {
  const g = globalThis as unknown as Holder;
  const existing = g[SINGLETON_KEY];
  if (existing) return existing;
  const bus = new MessageBus();
  g[SINGLETON_KEY] = bus;
  return bus;
}
