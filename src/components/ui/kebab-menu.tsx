"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export interface KebabAction {
  readonly label: ReactNode;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
}

export function KebabMenu({ actions, ariaLabel = "More actions", align = "right" }: {
  readonly actions: ReadonlyArray<KebabAction>;
  readonly ariaLabel?: string;
  readonly align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const btn: CSSProperties = {
    width: 26, height: 26, padding: 0,
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    background: "transparent",
    border: "1px solid var(--border)",
    borderRadius: 6,
    color: "var(--fg-muted)",
    cursor: "pointer",
    transition: "color .15s ease, border-color .15s ease, background .15s ease",
  };
  const menu: CSSProperties = {
    position: "absolute",
    top: "calc(100% + 6px)",
    [align]: 0,
    minWidth: 140,
    background: "var(--bg-tile)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: 4,
    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.55)",
    zIndex: 40,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    opacity: open ? 1 : 0,
    transform: open ? "translateY(0)" : "translateY(-4px)",
    pointerEvents: open ? "auto" : "none",
    transition: "opacity .15s ease, transform .15s ease",
  } as CSSProperties;

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--fg)"; e.currentTarget.style.borderColor = "var(--border-strong)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--fg-muted)"; e.currentTarget.style.borderColor = "var(--border)"; }}
        style={btn}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>

      <div role="menu" style={menu}>
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            role="menuitem"
            disabled={a.disabled}
            onClick={(e) => { e.stopPropagation(); setOpen(false); if (!a.disabled) a.onSelect(); }}
            style={{
              display: "flex",
              alignItems: "center",
              padding: "7px 10px",
              border: 0,
              background: "transparent",
              color: a.danger ? "var(--state-error)" : "var(--fg)",
              fontSize: 12,
              textAlign: "left",
              borderRadius: 4,
              cursor: a.disabled ? "not-allowed" : "pointer",
              opacity: a.disabled ? 0.5 : 1,
              transition: "background .12s ease",
            }}
            onMouseEnter={(e) => { if (!a.disabled) e.currentTarget.style.background = "color-mix(in srgb, var(--brand) 10%, transparent)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
