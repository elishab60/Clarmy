"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface KebabAction {
  readonly label: ReactNode;
  readonly onSelect: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
}

const MENU_WIDTH = 168;

export function KebabMenu({ actions, ariaLabel = "More actions", align = "right" }: {
  readonly actions: ReadonlyArray<KebabAction>;
  readonly ariaLabel?: string;
  readonly align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Anchor the menu to the trigger in viewport coords. Rendered in a portal with
  // position:fixed so it escapes any ancestor `overflow:hidden` (the metric-card
  // grid clips absolutely-positioned children) and ancestor stacking contexts.
  const place = useCallback(() => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const left = align === "right" ? b.right - MENU_WIDTH : b.left;
    const top = b.bottom + 6;
    const maxLeft = window.innerWidth - MENU_WIDTH - 8;
    setPos({ top, left: Math.max(8, Math.min(left, maxLeft)) });
  }, [align]);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const reposition = () => place();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, place]);

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
    position: "fixed",
    top: pos?.top ?? 0,
    left: pos?.left ?? 0,
    width: MENU_WIDTH,
    background: "var(--bg-tile)",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    padding: 4,
    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.55)",
    zIndex: 90,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    animation: "fade-in .12s ease",
  };

  return (
    <>
      <button
        ref={btnRef}
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

      {mounted && open && pos && createPortal(
        <div ref={menuRef} role="menu" style={menu}>
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
        </div>,
        document.body,
      )}
    </>
  );
}
