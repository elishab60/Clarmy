"use client";

import type { SessionSnapshot, SessionState } from "../shared/types";

// Desktop notifications for session state transitions an operator cares about
// while looking elsewhere: a tool waiting on approval, a failure, a finish.
// Gated on the Settings toggle (persisted under cockpit:notifications), the
// browser permission, and the page being hidden (no popups for what you are
// already watching). Clicking focuses the cockpit on that session.

const STORAGE_KEY = "cockpit:notifications";
const NOTIFY_STATES: ReadonlySet<SessionState> = new Set(["approval", "error", "done"]);

export function notificationsEnabled(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) !== "0"; } catch { return true; }
}

export function setNotificationsEnabled(on: boolean): void {
  try { localStorage.setItem(STORAGE_KEY, on ? "1" : "0"); } catch { /* ignore */ }
  if (on && typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission();
  }
}

const BODY: Record<string, (s: SessionSnapshot) => string> = {
  approval: (s) => `${s.tool ?? "a tool"} is waiting for your approval`,
  error: (s) => s.error ?? "session hit an error",
  done: (s) => s.summary ?? "session finished",
};

export function maybeNotifyTransition(prev: SessionSnapshot | undefined, next: SessionSnapshot): void {
  if (typeof window === "undefined" || typeof Notification === "undefined") return;
  if (!NOTIFY_STATES.has(next.state)) return;
  if (prev && prev.state === next.state) return;       // transitions only
  if (!notificationsEnabled()) return;
  if (Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;  // user is already here
  try {
    const icon = next.state === "approval" ? "▲" : next.state === "error" ? "✗" : "✓";
    const n = new Notification(`${icon} ${next.name} · ${next.state}`, {
      body: BODY[next.state]?.(next) ?? next.state,
      tag: `cockpit-${next.id}`,   // collapse repeats for the same session
    });
    n.onclick = () => {
      window.focus();
      window.location.href = `/focus/${next.id}`;
    };
  } catch { /* notification failures must never break the store */ }
}
