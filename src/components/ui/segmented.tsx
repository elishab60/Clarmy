"use client";

import type { CSSProperties, ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: ReactNode;
  readonly title?: string;
}

export interface SegmentedProps<T extends string> {
  readonly value: T;
  readonly onChange: (next: T) => void;
  readonly options: ReadonlyArray<SegmentedOption<T>>;
  readonly ariaLabel?: string;
  readonly size?: "sm" | "md";
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel, size = "md" }: SegmentedProps<T>) {
  const pad = size === "sm" ? "6px 12px" : "8px 14px";
  const wrap: CSSProperties = {
    display: "inline-flex",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg)",
    overflow: "hidden",
    isolation: "isolate",
  };

  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel} style={wrap}>
      {options.map((o, i) => {
        const active = o.value === value;
        const btn: CSSProperties = {
          padding: pad,
          border: 0,
          borderLeft: i === 0 ? "0" : "1px solid var(--border)",
          background: active ? "var(--brand)" : "transparent",
          color: active ? "var(--accent-foreground)" : "var(--fg-muted)",
          fontFamily: "var(--font-sans)",
          fontSize: 12,
          fontWeight: 500,
          cursor: "pointer",
          transition: "background .15s ease, color .15s ease",
          outline: "none",
        };
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            className={active ? "segmented-btn on" : "segmented-btn"}
            onClick={() => onChange(o.value)}
            style={btn}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
