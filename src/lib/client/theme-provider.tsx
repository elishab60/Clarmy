"use client";

import { useEffect } from "react";
import { applyTweaks, useCockpit } from "./store";
import { startWsClient } from "./ws-client";

export function ThemeBootstrap(): null {
  const tweaks = useCockpit((s) => s.tweaks);
  const setCmdkOpen = useCockpit((s) => s.setCmdkOpen);
  const setTweaks = useCockpit((s) => s.setTweaks);

  useEffect(() => {
    applyTweaks(tweaks);
  }, [tweaks]);

  useEffect(() => {
    const stop = startWsClient();
    return () => stop();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdkOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        setTweaks({ theme: tweaks.theme === "dark" ? "light" : "dark" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tweaks.theme, setCmdkOpen, setTweaks]);

  return null;
}
