"use client";

import type { CSSProperties, KeyboardEvent } from "react";

export interface ToggleSwitchProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
  readonly label?: string;
  readonly size?: "sm" | "md";
  readonly className?: string;
}

export function ToggleSwitch({ checked, onChange, disabled = false, label, size = "md", className }: ToggleSwitchProps) {
  const track: CSSProperties = size === "sm"
    ? { width: 28, height: 16, borderRadius: 8 }
    : { width: 36, height: 20, borderRadius: 10 };
  const thumbSize = size === "sm" ? 12 : 16;
  const travel = size === "sm" ? 12 : 16;
  const offset = 2;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onChange(!checked);
    }
  };

  const style: CSSProperties = {
    ...track,
    position: "relative",
    display: "inline-block",
    border: 0,
    padding: 0,
    cursor: disabled ? "not-allowed" : "pointer",
    background: checked ? "var(--brand)" : "color-mix(in srgb, var(--border-strong) 85%, transparent)",
    boxShadow: checked
      ? "inset 0 1px 2px rgba(0,0,0,0.15), 0 0 0 1px color-mix(in srgb, var(--brand) 55%, transparent), 0 0 16px -4px color-mix(in srgb, var(--brand) 65%, transparent)"
      : "inset 0 1px 2px rgba(0,0,0,0.3), inset 0 0 0 1px var(--border)",
    opacity: disabled ? 0.45 : 1,
    transition: "background .2s ease, box-shadow .2s ease",
    verticalAlign: "middle",
    flexShrink: 0,
  };
  const thumb: CSSProperties = {
    position: "absolute",
    top: offset,
    left: offset,
    width: thumbSize,
    height: thumbSize,
    borderRadius: "50%",
    background: "#fff",
    boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
    transform: checked ? `translateX(${travel}px)` : "translateX(0)",
    transition: "transform .2s ease",
    pointerEvents: "none",
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      className={className ? `toggle-switch ${className}` : "toggle-switch"}
      onClick={() => { if (!disabled) onChange(!checked); }}
      onKeyDown={onKey}
      style={style}
    >
      <span style={thumb} aria-hidden />
    </button>
  );
}
