"use client";

import type { SessionSnapshot } from "@/lib/shared/types";

export function TileError({ s }: { s: SessionSnapshot }) {
  return (
    <div className="err-body">
      <div className="err-msg">{s.error ?? "unknown error"}</div>
      <div className="err-retry">
        <span>auto-retry</span>
        <span className="bar"><span /></span>
        <span>{s.retryIn ?? 8}s</span>
      </div>
    </div>
  );
}
