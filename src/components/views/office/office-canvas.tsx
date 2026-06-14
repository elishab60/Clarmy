"use client";

import { useEffect, useRef } from "react";
import Phaser from "phaser";
import { useCockpit } from "@/lib/client/store";
import { OfficeScene } from "./game/scene";
import type { SessionLite } from "./game/types";

// Mounts the Phaser game and bridges the cockpit store into it. Strictly
// unidirectional: WS -> store -> scene.setSessions(); the scene never writes
// back. Rendering pauses when the tab is hidden and the game is destroyed on
// unmount (route change) so the office costs nothing while you work elsewhere.
export function OfficeCanvas({
  onSelect,
  selectedId,
  showPrompts,
  recenterKey,
}: {
  onSelect: (id: string | null) => void;
  selectedId: string | null;
  showPrompts: boolean;
  recenterKey: number;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<OfficeScene | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || gameRef.current) return;

    const scene = new OfficeScene();
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host,
      pixelArt: true,
      roundPixels: true,
      transparent: true,
      scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
      scene,
      banner: false,
    });
    gameRef.current = game;
    sceneRef.current = scene;

    const push = () => {
      const { sessions } = useCockpit.getState();
      const list: SessionLite[] = Object.values(sessions).map((s) => ({
        id: s.id, provider: s.provider, state: s.state, name: s.name, project: s.project,
        prompt: s.prompt, subagents: s.subagents,
      }));
      scene.setSessions(list);
      (window as unknown as { __officeSessionIds?: string[] }).__officeSessionIds = list.map((x) => x.id);
    };
    game.events.once("office-ready", push);
    game.events.on("select", onSelect);
    const unsub = useCockpit.subscribe((st, prev) => {
      if (st.sessions !== prev.sessions) push();
    });

    const onVisibility = () => {
      if (document.hidden) game.loop.sleep();
      else game.loop.wake();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      unsub();
      game.events.off("select", onSelect);
      game.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
    // onSelect is stable from the parent (useCallback)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { sceneRef.current?.setShowPrompts(showPrompts); }, [showPrompts]);
  useEffect(() => { sceneRef.current?.setSelected(selectedId); }, [selectedId]);
  // test hook: lets e2e open the terminal panel without pixel-perfect clicks
  useEffect(() => {
    (window as unknown as { __officeSelect?: (id: string | null) => void }).__officeSelect = onSelect;
    return () => { delete (window as unknown as { __officeSelect?: unknown }).__officeSelect; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { if (recenterKey > 0) sceneRef.current?.recenter(); }, [recenterKey]);

  return <div ref={hostRef} className="office-canvas" />;
}
