"use client";

import type { MouseEvent } from "react";
import { useCockpit } from "@/lib/client/store";
import type { SessionSnapshot } from "@/lib/shared/types";

export function TileApproval({ s }: { s: SessionSnapshot }) {
  const setApprovalFor = useCockpit((st) => st.setApprovalFor);

  if (!s.approval) return <div className="approval-preview">Awaiting approval details…</div>;
  const preview = Object.entries(s.approval.args);

  const act = (e: MouseEvent, allow: boolean) => {
    e.stopPropagation();
    void fetch(`/api/sessions/${s.id}/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toolUseId: s.approval!.toolUseId, allow }),
    });
  };

  const inspect = (e: MouseEvent) => {
    e.stopPropagation();
    setApprovalFor(s);
  };

  return (
    <div className="approval-preview">
      <div className="tool-name">{s.approval.tool} · awaiting approval</div>
      <pre onClick={inspect} style={{ cursor: "pointer" }}>
        {preview.map(([k, v]) => (
          <div key={k}>
            <span className="arg-k">{k}</span>: <span className="arg-s">{JSON.stringify(v)}</span>
          </div>
        ))}
      </pre>
      <div className="approval-actions">
        <button className="allow" onClick={(e) => act(e, true)}>Allow</button>
        <button className="deny" onClick={(e) => act(e, false)}>Deny</button>
      </div>
    </div>
  );
}
