"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCockpit } from "@/lib/client/store";
import { Icon, type IconName } from "./icons";
import { Clawd } from "./clawd";

const NAV_PRIMARY: { k: string; href: string; label: string; icon: IconName; badge?: string }[] = [
  { k: "sessions", href: "/",         label: "Sessions", icon: "sessions" },
  { k: "projects", href: "/projects", label: "Projects", icon: "projects" },
  { k: "history",  href: "/history",  label: "History",  icon: "history"  },
  { k: "metrics",  href: "/metrics",  label: "Metrics",  icon: "metrics"  },
];

const NAV_CONFIG: { k: string; href: string; label: string; icon: IconName; badge?: string }[] = [
  { k: "skills",   href: "/skills",   label: "Skills",      icon: "skills"   },
  { k: "mcp",      href: "/mcp",      label: "MCP servers", icon: "mcp"      },
  { k: "plugins",  href: "/plugins",  label: "Plugins",     icon: "plugins"  },
  { k: "hooks",    href: "/hooks",    label: "Hooks",       icon: "hooks"    },
  { k: "settings", href: "/settings", label: "Settings",    icon: "settings" },
];

interface SideStats {
  projects: number;
  history: number;
  metrics: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sessions = useCockpit((s) => s.sessions);
  const count = Object.keys(sessions).length;
  const approvals = Object.values(sessions).filter((v) => v.state === "approval").length;
  const [stats, setStats] = useState<SideStats>({ projects: 0, history: 0, metrics: 0 });
  const [quickPrompt, setQuickPrompt] = useState("");

  const launchQuick = () => {
    const p = quickPrompt.trim();
    if (!p) { router.push("/new"); return; }
    setQuickPrompt("");
    router.push(`/new?prompt=${encodeURIComponent(p)}&autolaunch=1`);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/metrics", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as { metrics: { totalSessions: number; perProject: unknown[]; totalToolCalls: number } };
        if (cancelled) return;
        setStats({
          projects: j.metrics.perProject.length,
          history: j.metrics.totalSessions,
          metrics: j.metrics.totalToolCalls,
        });
      } catch { /* ignore */ }
    };
    void load();
    const id = setInterval(load, 20_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const BADGES: Record<string, number | string> = {
    sessions: count,
    projects: stats.projects || "—",
    history: stats.history || "—",
    metrics: stats.metrics ? fmtShort(stats.metrics) : "—",
  };

  const isActive = (href: string, k: string) => {
    if (k === "sessions") return pathname === "/" || pathname.startsWith("/focus");
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="wordmark"><Clawd size={26} /><span className="slave-text">Slave</span></div>
      </div>
      <button className="new-session" onClick={() => router.push("/new")}>
        <span className="plus">+</span> New session
        <span className="kbd">⌘N</span>
      </button>
      <div className="quick-prompt">
        <textarea
          value={quickPrompt}
          onChange={(e) => setQuickPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              launchQuick();
            }
          }}
          placeholder="Quick prompt — ↵ to launch"
          rows={2}
        />
      </div>

      <div className="nav-group">
        <div className="nav-label">Navigation</div>
        {NAV_PRIMARY.map((n, i) => (
          <Link
            key={n.k}
            href={n.href}
            className={`nav-item ${isActive(n.href, n.k) ? "active" : ""}`}
            style={{ animationDelay: `${i * 32}ms` }}
          >
            <Icon name={n.icon} />{n.label}
            <span className="badge">{BADGES[n.k] ?? "—"}</span>
          </Link>
        ))}
      </div>

      <div className="nav-group">
        <div className="nav-label">Config</div>
        {NAV_CONFIG.map((n, i) => (
          <Link
            key={n.k}
            href={n.href}
            className={`nav-item ${isActive(n.href, n.k) ? "active" : ""}`}
            style={{ animationDelay: `${(NAV_PRIMARY.length + i) * 32}ms` }}
          >
            <Icon name={n.icon} />{n.label}
          </Link>
        ))}
      </div>

      <div className="sidebar-alerts">
        <div className="nav-label" style={{ padding: "4px 4px 6px" }}>Alerts</div>
        <div className={`alert-row ${approvals > 0 ? "amber" : ""}`}>
          <span>Pending approvals</span>
          <span className="v"><CountUp value={approvals} /></span>
        </div>
        <div className="alert-row">
          <span>Sessions total</span>
          <span className="v"><CountUp value={count} /></span>
        </div>
      </div>
    </aside>
  );
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function CountUp({ value, duration = 520 }: { value: number; duration?: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const cur = Math.round(from + (to - from) * eased);
      setDisplay(cur);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current != null) cancelAnimationFrame(rafRef.current); };
  }, [value, duration]);

  return <>{display}</>;
}
