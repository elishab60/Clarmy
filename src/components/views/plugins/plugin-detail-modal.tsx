"use client";

import { useEffect } from "react";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import type { Plugin } from "@/components/views/plugins-page";

// Detail / configure view for one plugin, opened from the card's Configure
// button or the kebab "Edit" action. Mirrors the MCP configure modal's overlay
// pattern (inline styles, click-out + Escape to close).
export function PluginDetailModal({
  plugin, enabled, onToggle, onUpdate, onUninstall, onClose,
}: {
  readonly plugin: Plugin;
  readonly enabled: boolean;
  readonly onToggle: (next: boolean) => void;
  readonly onUpdate: () => void;
  readonly onUninstall: () => void;
  readonly onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const hasUpdate = plugin.status === "update";
  const statusLabel = enabled ? (hasUpdate ? "Update available" : "Enabled") : "Disabled";
  const statusColor = enabled
    ? (hasUpdate ? "var(--state-error)" : "var(--state-done)")
    : "var(--fg-muted)";

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.58)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
        animation: "fade-in .2s ease", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${plugin.name} details`}
        style={{
          width: 560, maxWidth: "92vw", maxHeight: "88vh",
          background: "var(--bg-elev)", border: "1px solid var(--border-strong)",
          borderRadius: 10, padding: 24,
          display: "flex", flexDirection: "column", gap: 18,
          boxShadow: "0 30px 80px -20px rgba(0,0,0,0.7)",
          overflow: "auto",
        }}
      >
        <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: statusColor, flexShrink: 0 }} aria-hidden />
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{plugin.name}</h2>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--fg-muted)" }}>{plugin.version}</span>
          <div style={{ marginLeft: "auto" }}>
            <ToggleSwitch
              checked={enabled}
              onChange={onToggle}
              size="sm"
              label={`${enabled ? "Disable" : "Enable"} ${plugin.name}`}
            />
          </div>
        </header>

        <Field label="Status">
          <span style={{ color: statusColor, fontSize: 13 }}>{statusLabel}</span>
        </Field>

        <Field label="Source">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--fg-dim)", wordBreak: "break-all" }}>{plugin.source}</span>
        </Field>

        <Field label="Description">
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--fg-dim)", lineHeight: 1.6 }}>{plugin.desc}</p>
        </Field>

        <Field label="Ships">
          <div style={{ display: "flex", gap: 10 }}>
            <Pill n={plugin.skills} unit="skills" />
            <Pill n={plugin.agents} unit="agents" />
            <Pill n={plugin.hooks} unit="hooks" />
          </div>
        </Field>

        <footer style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
          <button className="btn danger" onClick={onUninstall} style={{ color: "var(--state-error)" }}>Uninstall</button>
          {hasUpdate && <button className="btn primary" onClick={onUpdate}>Update now</button>}
          <button className="btn" onClick={onClose} style={{ marginLeft: "auto" }}>Close</button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 10.5, fontWeight: 600, color: "var(--fg-muted)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
      {children}
    </div>
  );
}

function Pill({ n, unit }: { n: number; unit: string }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--fg-dim)",
      padding: "4px 10px", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6,
    }}>
      <strong style={{ color: "var(--fg)" }}>{n}</strong> {unit}
    </span>
  );
}
