"use client";

import { useCockpit, type Tweaks } from "@/lib/client/store";

const ACCENTS = [
  { k: "#d97757", n: "orange" },
  { k: "#4a9eff", n: "blue" },
  { k: "#a78bfa", n: "purple" },
  { k: "#22c55e", n: "green" },
  { k: "#e5e5e5", n: "mono" },
];

export function TweaksPanel() {
  const open = useCockpit((s) => s.tweaksOpen);
  const setOpen = useCockpit((s) => s.setTweaksOpen);
  const tweaks = useCockpit((s) => s.tweaks);
  const setTweaks = useCockpit((s) => s.setTweaks);

  if (!open) return null;

  const set = <K extends keyof Tweaks>(k: K, v: Tweaks[K]) => setTweaks({ [k]: v } as Partial<Tweaks>);

  return (
    <div className="tweaks-panel">
      <h4>
        <span>Tweaks</span>
        <button onClick={() => setOpen(false)} style={{ color: "var(--fg-muted)", fontFamily: "var(--font-mono)" }}>✕</button>
      </h4>

      <div className="tw-row">
        <div className="lbl">Theme</div>
        <div className="seg">
          {(["dark", "light"] as const).map((v) => (
            <button key={v} className={tweaks.theme === v ? "on" : ""} onClick={() => set("theme", v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tw-row">
        <div className="lbl">Density</div>
        <div className="seg">
          {(["compact", "default", "cozy"] as const).map((v) => (
            <button key={v} className={tweaks.density === v ? "on" : ""} onClick={() => set("density", v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tw-row">
        <div className="lbl">Grid columns</div>
        <div className="seg">
          {([2, 3, 4] as const).map((v) => (
            <button key={v} className={tweaks.cols === v ? "on" : ""} onClick={() => set("cols", v)}>{v}</button>
          ))}
        </div>
      </div>

      <div className="tw-row">
        <div className="lbl">Accent</div>
        <div className="accents">
          {ACCENTS.map((a) => (
            <button
              key={a.k}
              className={tweaks.accent === a.k ? "on" : ""}
              style={{ background: a.k }}
              onClick={() => set("accent", a.k)}
              title={a.n}
              aria-label={a.n}
            />
          ))}
        </div>
      </div>

      <div className="tw-row">
        <div className="lbl">Tile variant</div>
        <div className="seg">
          {(["card", "strip"] as const).map((v) => (
            <button key={v} className={tweaks.tileVariant === v ? "on" : ""} onClick={() => set("tileVariant", v)}>{v}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
