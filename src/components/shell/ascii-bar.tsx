"use client";

// Shared terminal-style ASCII fill bar used by the context meter and the quota
// gauges. Solid blocks plus an eighth-block sub-cell edge give smooth growth;
// the filled run shimmers and the edge blinks like a cursor (see globals.css
// .ascii-bar). The unfilled track is tinted with the user's accent colour.

export type AsciiTone = "ok" | "warn" | "crit";

function buildBar(pct: number, cells: number): { full: string; edge: string; empty: string } {
  const exact = Math.max(0, Math.min(cells, (pct / 100) * cells));
  const full = Math.floor(exact);
  const frac = exact - full;
  const eighths = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
  const hasEdge = full < cells && frac >= 0.05;
  const edge = hasEdge ? (eighths[Math.min(7, Math.max(1, Math.round(frac * 8)))] ?? "▌") : "";
  return {
    full: "█".repeat(full),
    edge,
    empty: "░".repeat(Math.max(0, cells - full - (hasEdge ? 1 : 0))),
  };
}

export function AsciiBar({
  pct,
  cells = 26,
  tone = "ok",
  size,
}: {
  pct: number | null;
  cells?: number;
  tone?: AsciiTone;
  size?: "sm";
}) {
  const p = pct === null ? 0 : Math.max(0, Math.min(100, pct));
  const { full, edge, empty } = buildBar(p, cells);
  return (
    <div
      className={`ascii-bar${size === "sm" ? " sm" : ""}`}
      data-tone={tone}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct === null ? undefined : Math.round(p)}
    >
      <span className="ab-bracket">[</span>
      <span className="ab-fill">{full}</span>
      <span className="ab-edge">{edge}</span>
      <span className="ab-empty">{empty}</span>
      <span className="ab-bracket">]</span>
    </div>
  );
}
