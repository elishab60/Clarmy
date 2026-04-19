"use client";

import type { SessionSnapshot } from "@/lib/shared/types";

export function TileToolUse({ s }: { s: SessionSnapshot }) {
  const diff = s.diff ?? [];
  const path = s.editPath ?? s.tool ?? "";
  return (
    <div className="diff">
      <div className="diff-header">
        <span className="chip">{s.tool ?? "Tool"}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{path}</span>
      </div>
      {diff.length === 0
        ? <div className="row ctx"><span className="ln">—</span><span className="txt">{s.tool ?? "running tool"}</span></div>
        : diff.slice(0, 12).map((r, i) => (
          <div key={i} className={`row ${r.type}`}>
            <span className="ln">{r.ln}</span>
            <span className="txt">{r.txt}</span>
          </div>
        ))
      }
    </div>
  );
}
