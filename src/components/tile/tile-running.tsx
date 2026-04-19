"use client";

import { useEffect, useState } from "react";
import type { SessionSnapshot } from "@/lib/shared/types";

export function TileRunning({ s }: { s: SessionSnapshot }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1400);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="term-stream" key={tick}>
      {s.logs.slice(-18).map((l, i) => (
        <span key={i} className={`ln ${l.t}`}>
          {l.t === "gt" ? "› " : ""}{l.v}
        </span>
      ))}
      <span className="cursor" />
    </div>
  );
}
