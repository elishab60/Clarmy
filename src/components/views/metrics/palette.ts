// Categorical palette for donuts / legends. Brand orange leads, then a set of
// hues that read clearly on the dark terminal surface (and the light theme).
export const CHART_COLORS = [
  "var(--brand)",
  "#4a9eff",
  "#a78bfa",
  "#22c55e",
  "#f5a524",
  "#2dd4bf",
  "#f472b6",
  "#60a5fa",
  "#facc15",
  "#34d399",
  "#fb7185",
  "#c084fc",
] as const;

export const OTHER_COLOR = "var(--fg-faint)";

export function colorAt(i: number): string {
  if (i < 0) return OTHER_COLOR;
  return CHART_COLORS[i % CHART_COLORS.length]!;
}
