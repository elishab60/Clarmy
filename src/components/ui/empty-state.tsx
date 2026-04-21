"use client";

import type { CSSProperties, ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  subtitle,
  action,
}: {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly subtitle?: string;
  readonly action?: ReactNode;
}) {
  const wrap: CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "48px 24px",
    textAlign: "center",
    color: "var(--fg-muted)",
  };
  return (
    <div style={wrap}>
      {icon && <div aria-hidden style={{ opacity: 0.6 }}>{icon}</div>}
      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)" }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13, color: "var(--fg-muted)", maxWidth: 360, lineHeight: 1.5 }}>{subtitle}</div>}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  );
}
