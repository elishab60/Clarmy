"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCockpit } from "@/lib/client/store";

const TABS = [
  { href: "/", label: "Dashboard" },
  { href: "/new", label: "New session" },
  { href: "/mcp", label: "MCP" },
  { href: "/theme-ab", label: "Theme A/B" },
];

function titleFor(pathname: string): string {
  if (pathname === "/") return "Sessions · dashboard";
  if (pathname.startsWith("/focus/")) return "Sessions · focus";
  if (pathname === "/new") return "Sessions · new";
  if (pathname === "/mcp") return "Config · MCP servers";
  if (pathname === "/theme-ab") return "Theme A/B";
  return "Cockpit";
}

export function Topbar() {
  const pathname = usePathname();
  const sessions = useCockpit((s) => s.sessions);
  const tweaks = useCockpit((s) => s.tweaks);
  const setTweaks = useCockpit((s) => s.setTweaks);
  const setCmdkOpen = useCockpit((s) => s.setCmdkOpen);

  const count = Object.keys(sessions).length;
  const total = Object.values(sessions).reduce((a, s) => a + s.cost, 0);

  return (
    <header className="topbar">
      <div className="title">
        <strong>{titleFor(pathname)}</strong>
      </div>
      <div className="view-tabs">
        {TABS.map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? "active" : ""}>
            {t.label}
          </Link>
        ))}
      </div>
      <div className="meta">
        <span><span className="k">sessions</span><span className="v">{count}</span></span>
        <span><span className="k">cost today</span><span className="v">${total.toFixed(2)}</span></span>
        <button className="cmdk-trigger" onClick={() => setCmdkOpen(true)}>
          <span>Search or run a command</span>
          <span className="kbd">⌘K</span>
        </button>
        <div className="theme-toggle" role="tablist">
          <button className={tweaks.theme === "dark" ? "on" : ""} onClick={() => setTweaks({ theme: "dark" })}>dark</button>
          <button className={tweaks.theme === "light" ? "on" : ""} onClick={() => setTweaks({ theme: "light" })}>light</button>
        </div>
      </div>
    </header>
  );
}
