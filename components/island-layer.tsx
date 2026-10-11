"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { loadIsland } from "@/lib/island-loader";
import { setNotifier } from "@/lib/notify";
import { useEffectiveSkin } from "@/lib/use-skin";

type Island = Awaited<ReturnType<typeof loadIsland>>;

export function IslandLayer() {
  const active = useEffectiveSkin() === "island";
  const { resolvedTheme } = useTheme();
  const [lib, setLib] = useState<Island | null>(null);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadIsland()
      .then((mod) => {
        if (!cancelled) setLib(mod);
      })
      .catch(() => {
        // 库加载失败时保持仅 token 皮肤；通知继续回落 sonner
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  useEffect(() => {
    if (!active || !lib) return;
    setNotifier(lib.Notification);
    document.body.classList.add("animal-cursor", "animal-cursor--force");
    return () => {
      setNotifier(null);
      lib.Notification.destroy();
      document.body.classList.remove("animal-cursor", "animal-cursor--force");
    };
  }, [active, lib]);

  useEffect(() => {
    if (!active) return;
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [active]);

  if (!active || !lib) return null;

  const { BackTop, Background } = lib;
  return (
    <>
      <BackTop />
      {wide && resolvedTheme !== "dark" ? (
        <Background
          type="default"
          aria-hidden
          style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none", opacity: 0.5 }}
        />
      ) : null}
    </>
  );
}
