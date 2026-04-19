"use client";

import type { SessionSnapshot } from "@/lib/shared/types";

export function TileDone({ s }: { s: SessionSnapshot }) {
  const arts = s.artifacts ?? [];
  return (
    <div className="done-body">
      <div className="done-summary">{s.summary ?? "Completed."}</div>
      {arts.length > 0 && (
        <div className="done-artifacts">
          {arts.map((a, i) => <span key={i} className="art">{a}</span>)}
        </div>
      )}
    </div>
  );
}
