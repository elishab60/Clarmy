export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

export function fmtTokens(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

export function fmtCost(n: number): string {
  if (!n) return "$0";
  const abs = Math.abs(n);
  if (abs >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  if (abs >= 100) return `$${Math.round(n).toLocaleString("en-US")}`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(3)}`;
}

export function fmtCostFull(n: number): string {
  if (!n) return "$0.00";
  if (Math.abs(n) >= 1) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;
  return `$${n.toFixed(3)}`;
}

export function fmtRel(t: number): string {
  if (!t) return "—";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.floor(d / 30);
  return `${mo}mo ago`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Format a YYYY-MM-DD day key without timezone drift.
export function fmtDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function fmtPct(n: number): string {
  const v = Math.round(n);
  return `${v > 0 ? "+" : ""}${v}%`;
}
