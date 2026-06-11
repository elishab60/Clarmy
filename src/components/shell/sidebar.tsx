"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useCockpit } from "@/lib/client/store";
import { Icon, type IconName } from "./icons";
import { Clawd } from "./clawd";
import { QuotaMeters } from "./quota-meters";

const NAV_PRIMARY: { k: string; href: string; label: string; icon: IconName; badge?: string }[] = [
  { k: "sessions", href: "/",         label: "Sessions", icon: "sessions" },
  { k: "projects", href: "/projects", label: "Projects", icon: "projects" },
  { k: "history",  href: "/history",  label: "History",  icon: "history"  },
  { k: "metrics",  href: "/metrics",  label: "Metrics",  icon: "metrics"  },
];

const NAV_CONFIG: { k: string; href: string; label: string; icon: IconName; badge?: string }[] = [
  { k: "agents",   href: "/agents",   label: "Agents",      icon: "agents"   },
  { k: "crons",    href: "/crons",    label: "Cron jobs",   icon: "crons"    },
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

interface ConfigCounts {
  agents: number;
  crons: number;
  skills: number;
  mcp: number;
  plugins: number;
  hooks: number;
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sessions = useCockpit((s) => s.sessions);
  const visibleProviders = useCockpit((s) => s.visibleProviders);
  const metricsVersion = useCockpit((s) => s.metricsVersion);
  const scoped = Object.values(sessions).filter((v) => visibleProviders.includes(v.provider));
  const count = scoped.length;
  const [stats, setStats] = useState<SideStats>({ projects: 0, history: 0, metrics: 0 });
  const [cfgCounts, setCfgCounts] = useState<ConfigCounts>({ agents: 0, crons: 0, skills: 0, mcp: 0, plugins: 0, hooks: 0 });
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
        const [mRes, cRes] = await Promise.all([
          fetch("/api/metrics", { cache: "no-store" }),
          fetch("/api/sidebar-counts", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (mRes.ok) {
          const j = (await mRes.json()) as { sessions: Array<{ provider: string; cwd: string; toolUses: number }> };
          const rows = (j.sessions ?? []).filter((r) => (visibleProviders as readonly string[]).includes(r.provider));
          setStats({
            projects: new Set(rows.map((r) => r.cwd)).size,
            history: rows.length,
            metrics: rows.reduce((a, r) => a + r.toolUses, 0),
          });
        }
        if (cRes.ok) {
          setCfgCounts(await cRes.json() as ConfigCounts);
        }
      } catch { /* ignore */ }
    };
    void load();
    const id = setInterval(load, 60_000); // fallback only; WS drives refreshes
    return () => { cancelled = true; clearInterval(id); };
  }, [visibleProviders, metricsVersion]);

  const BADGES: Record<string, number | string> = {
    sessions: count,
    projects: stats.projects || "—",
    history: stats.history || "—",
    metrics: stats.metrics ? fmtShort(stats.metrics) : "—",
    agents: cfgCounts.agents || "—",
    crons: cfgCounts.crons || "—",
    skills: cfgCounts.skills || "—",
    mcp: cfgCounts.mcp || "—",
    plugins: cfgCounts.plugins || "—",
    hooks: cfgCounts.hooks || "—",
  };

  const isActive = (href: string, k: string) => {
    if (k === "sessions") return pathname === "/" || pathname.startsWith("/focus");
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="wordmark"><Clawd size={26} /><span className="clarmy-text">Clarmy</span></div>
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
            {BADGES[n.k] !== undefined && <span className="badge">{BADGES[n.k]}</span>}
          </Link>
        ))}
      </div>

      <QuotaMeters />
    </aside>
  );
}

function fmtShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
