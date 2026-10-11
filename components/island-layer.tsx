"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { setNotifier } from "@/lib/notify";
import { useIsland } from "@/lib/use-island";

export function IslandLayer() {
  const lib = useIsland();
  const active = lib !== null;
  const { resolvedTheme } = useTheme();
  const [wide, setWide] = useState(false);

  useEffect(() => {
    if (!lib) return;
    setNotifier(lib.Notification);
    document.body.classList.add("animal-cursor", "animal-cursor--force");
    return () => {
      setNotifier(null);
      lib.Notification.destroy();
      document.body.classList.remove("animal-cursor", "animal-cursor--force");
    };
  }, [lib]);

  useEffect(() => {
    if (!active) return;
    const query = window.matchMedia("(min-width: 768px)");
    const sync = () => setWide(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [active]);

  if (!lib) return null;

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
