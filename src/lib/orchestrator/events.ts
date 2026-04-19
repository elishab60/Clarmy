import type { SessionEvent } from "../shared/types.ts";

type Listener = (e: SessionEvent) => void;

export class EventBus {
  private readonly listeners = new Set<Listener>();

  emit(event: SessionEvent): void {
    for (const l of this.listeners) {
      try { l(event); }
      catch { /* swallow — one listener shouldn't break the bus */ }
    }
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => { this.listeners.delete(cb); };
  }

  get size(): number { return this.listeners.size; }
}
