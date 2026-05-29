"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCockpit } from "@/lib/client/store";

function titleFor(pathname: string): string {
  if (pathname === "/") return "Sessions · dashboard";
  if (pathname.startsWith("/focus/")) return "Sessions · focus";
  if (pathname === "/new") return "Sessions · new";
  if (pathname === "/mcp") return "Config · MCP servers";
  if (pathname === "/theme-ab") return "Theme A/B";
  return "Cockpit";
}

interface MetricsPayload {
  sessions: Array<{ day: string | null; cost: number }>;
}

function fmtCost(n: number): string {
  if (!n) return "$0.00";
  if (n >= 10_000) return `$${(n / 1_000).toFixed(1)}k`;
  if (n >= 100) return `$${n.toFixed(0)}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

export function Topbar() {
  const pathname = usePathname();
  const sessions = useCockpit((s) => s.sessions);
  const tweaks = useCockpit((s) => s.tweaks);
  const setTweaks = useCockpit((s) => s.setTweaks);
  const setCmdkOpen = useCockpit((s) => s.setCmdkOpen);
  const [todayCost, setTodayCost] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as MetricsPayload;
        if (!alive) return;
        const today = new Date().toISOString().slice(0, 10);
        const cost = j.sessions.reduce((a, r) => (r.day === today ? a + r.cost : a), 0);
        setTodayCost(cost);
      } catch {}
    };
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const count = Object.keys(sessions).length;

  return (
    <header className="topbar">
      <div className="title">
        <strong>{titleFor(pathname)}</strong>
      </div>
      <div className="meta">
        <span><span className="k">sessions</span><span className="v">{count}</span></span>
        <span><span className="k">cost today</span><span className="v">{todayCost === null ? "…" : fmtCost(todayCost)}</span></span>
        <button className="cmdk-trigger" onClick={() => setCmdkOpen(true)}>
          <span>Search or run a command</span>
          <span className="kbd">⌘K</span>
        </button>
        <div className="theme-toggle" role="tablist">
          <button suppressHydrationWarning className={mounted && tweaks.theme === "dark" ? "on" : ""} onClick={() => setTweaks({ theme: "dark" })}>dark</button>
          <button suppressHydrationWarning className={mounted && tweaks.theme === "light" ? "on" : ""} onClick={() => setTweaks({ theme: "light" })}>light</button>
        </div>
      </div>
    </header>
  );
}
