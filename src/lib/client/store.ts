"use client";

import { create } from "zustand";
import type { SessionSnapshot, SessionEvent } from "../shared/types";
import {
  buildAccentTokens,
  coerceMonoFontKey,
  coerceUiFontKey,
  getMonoFontOption,
  getUiFontOption,
  normalizeHexColor,
  type MonoFontKey,
  type UiFontKey,
} from "./theme-settings";

export interface Tweaks {
  theme: "dark" | "light";
  density: "compact" | "default" | "cozy";
  cols: 2 | 3 | 4;
  accent: string;
  uiFont: UiFontKey;
  monoFont: MonoFontKey;
  tileVariant: "card" | "strip";
}

export const DEFAULT_TWEAKS: Tweaks = {
  theme: "dark",
  density: "default",
  cols: 3,
  accent: "#d97757",
  uiFont: "inter",
  monoFont: "jetbrains",
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
    const next = normalizeTweaks({ ...get().tweaks, ...patch });
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
    return normalizeTweaks(JSON.parse(raw) as unknown);
  } catch { return DEFAULT_TWEAKS; }
}

function persistTweaks(t: Tweaks): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem("cockpit.tweaks", JSON.stringify(t));
}

export function applyTweaks(t: Tweaks): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const accent = buildAccentTokens(t.accent, t.theme);
  root.setAttribute("data-theme", t.theme);
  root.setAttribute("data-density", t.density);
  root.setAttribute("data-ui-font", t.uiFont);
  root.setAttribute("data-mono-font", t.monoFont);
  root.style.setProperty("--font-sans", getUiFontOption(t.uiFont).stack);
  root.style.setProperty("--font-mono", getMonoFontOption(t.monoFont).stack);
  root.style.setProperty("--accent-source", accent.source);
  root.style.setProperty("--accent", accent.accent);
  root.style.setProperty("--accent-hover", accent.accentHover);
  root.style.setProperty("--accent-foreground", accent.accentForeground);
  root.style.setProperty("--accent-soft", accent.accentSoft);
  root.style.setProperty("--accent-muted", accent.accentMuted);
  root.style.setProperty("--accent-border", accent.accentBorder);
  root.style.setProperty("--accent-ring", accent.accentRing);
  root.style.setProperty("--accent-glow", accent.accentGlow);
  root.style.setProperty("--brand", accent.accent);
  root.style.setProperty("--brand-hover", accent.accentHover);
}

function normalizeTweaks(value: unknown): Tweaks {
  if (!isRecord(value)) return DEFAULT_TWEAKS;
  const theme = value.theme === "light" || value.theme === "dark" ? value.theme : DEFAULT_TWEAKS.theme;
  const density =
    value.density === "compact" || value.density === "default" || value.density === "cozy"
      ? value.density
      : DEFAULT_TWEAKS.density;
  const cols = value.cols === 2 || value.cols === 3 || value.cols === 4 ? value.cols : DEFAULT_TWEAKS.cols;
  const accent = typeof value.accent === "string" ? normalizeHexColor(value.accent) ?? DEFAULT_TWEAKS.accent : DEFAULT_TWEAKS.accent;
  const tileVariant = value.tileVariant === "strip" || value.tileVariant === "card" ? value.tileVariant : DEFAULT_TWEAKS.tileVariant;

  return {
    theme,
    density,
    cols,
    accent,
    uiFont: coerceUiFontKey(value.uiFont),
    monoFont: coerceMonoFontKey(value.monoFont),
    tileVariant,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
