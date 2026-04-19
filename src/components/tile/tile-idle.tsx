"use client";

import type { SessionSnapshot } from "@/lib/shared/types";

const MARKS = { done: "✓", active: "◐", todo: "○" } as const;

export function TileIdle({ s }: { s: SessionSnapshot }) {
  const items = s.todoList ?? [];
  if (items.length === 0) {
    return <div className="todos"><div className="todo"><span className="mark">○</span><span className="label">No todos yet — waiting for next turn.</span></div></div>;
  }
  return (
    <div className="todos">
      {items.slice(0, 8).map((t, i) => (
        <div key={i} className={`todo ${t.status}`}>
          <span className="mark">{MARKS[t.status]}</span>
          <span className="label">{t.text}</span>
        </div>
      ))}
    </div>
  );
}
