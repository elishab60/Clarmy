"use client";

import { create } from "zustand";
import type { SessionSnapshot, SessionEvent } from "../shared/types";

export interface Tweaks {
  theme: "dark" | "light";
  density: "compact" | "default" | "cozy";
  cols: 2 | 3 | 4;
  accent: string;
  tileVariant: "card" | "strip";
}

export const DEFAULT_TWEAKS: Tweaks = {
  theme: "dark",
  density: "default",
  cols: 3,
  accent: "#d97757",
  tileVariant: "card",
};

interface CockpitState {
  sessions: Record<string, SessionSnapshot>;
  order: string[];
  connected: boolean;
  tweaksOpen: boolean;
  cmdkOpen: boolean;
  approvalFor: SessionSnapshot | null;
  tweaks: Tweaks;

  setTweaks: (patch: Partial<Tweaks>) => void;
  setTweaksOpen: (open: boolean) => void;
  setCmdkOpen: (open: boolean) => void;
  setApprovalFor: (s: SessionSnapshot | null) => void;
  setConnected: (c: boolean) => void;

  hydrateSessions: (list: readonly SessionSnapshot[]) => void;
  applyEvent: (e: SessionEvent) => void;
}

export const useCockpit = create<CockpitState>((set, get) => ({
  sessions: {},
  order: [],
  connected: false,
  tweaksOpen: false,
  cmdkOpen: false,
  approvalFor: null,
  tweaks: loadTweaks(),

  setTweaks: (patch) => {
    const next = { ...get().tweaks, ...patch };
    persistTweaks(next);
    applyTweaks(next);
    set({ tweaks: next });
  },
  setTweaksOpen: (o) => set({ tweaksOpen: o }),
  setCmdkOpen: (o) => set({ cmdkOpen: o }),
  setApprovalFor: (s) => set({ approvalFor: s }),
  setConnected: (c) => set({ connected: c }),

  hydrateSessions: (list) => {
    const sessions: Record<string, SessionSnapshot> = {};
    const order: string[] = [];
    for (const s of list) { sessions[s.id] = s; order.push(s.id); }
    set({ sessions, order });
  },

  applyEvent: (event) => {
    const { sessions, order } = get();
    if (event.kind === "init") {
      const { snapshot } = event;
      set({
        sessions: { ...sessions, [snapshot.id]: snapshot },
        order: order.includes(snapshot.id) ? order : [...order, snapshot.id],
      });
      return;
    }
    if (event.kind === "gone") {
      if (!sessions[event.id]) return;
      const next = { ...sessions };
      delete next[event.id];
      set({ sessions: next, order: order.filter((id) => id !== event.id) });
      return;
    }
    if (event.kind === "patch") {
      const existing = sessions[event.id];
      if (!existing) return;
      set({ sessions: { ...sessions, [event.id]: { ...existing, ...event.patch } } });
      return;
    }
    if (event.kind === "log") {
      const existing = sessions[event.id];
      if (!existing) return;
      const logs = existing.logs.slice();
      logs.push(event.line);
      if (logs.length > 500) logs.splice(0, logs.length - 500);
      set({ sessions: { ...sessions, [event.id]: { ...existing, logs } } });
    }
  },
}));

function loadTweaks(): Tweaks {
  if (typeof window === "undefined") return DEFAULT_TWEAKS;
  try {
    const raw = window.localStorage.getItem("cockpit.tweaks");
    if (!raw) return DEFAULT_TWEAKS;
    return { ...DEFAULT_TWEAKS, ...JSON.parse(raw) };
  } catch { return DEFAULT_TWEAKS; }
}

function persistTweaks(t: Tweaks): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("cockpit.tweaks", JSON.stringify(t));
}

export function applyTweaks(t: Tweaks): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", t.theme);
  root.setAttribute("data-density", t.density);
  root.style.setProperty("--brand", t.accent);
  root.style.setProperty("--brand-hover", t.accent);
}
