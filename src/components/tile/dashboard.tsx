"use client";

import { useCockpit } from "@/lib/client/store";
import { providerMeta } from "@/lib/shared/providers";
import { Tile } from "./tile";

export function Dashboard() {
  const sessions = useCockpit((s) => s.sessions);
  const order = useCockpit((s) => s.order);
  const cols = useCockpit((s) => s.tweaks.cols);
  const provider = useCockpit((s) => s.provider);

  const list = order
    .map((id) => sessions[id])
    .filter((v): v is NonNullable<typeof v> => Boolean(v) && v!.provider === provider);

  if (list.length === 0) {
    return (
      <div style={{ padding: 40, color: "var(--fg-muted)", fontSize: 13 }}>
        No {providerMeta(provider).label} sessions yet. Click <strong style={{ color: "var(--fg)" }}>New session</strong> to spawn one.
      </div>
    );
  }

  return (
    <div className="grid" style={{ ["--cols" as string]: String(cols) }}>
      {list.map((s) => <Tile key={s.id} s={s} />)}
    </div>
  );
}
