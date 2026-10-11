"use client";

import { useIsland } from "@/lib/use-island";

export default function HeroBackground() {
  const lib = useIsland();
  if (!lib) return null;

  const { Background } = lib;
  return (
    <Background
      type="sprinkles"
      className="hero-sprinkles"
      aria-hidden
      style={{ position: "absolute", inset: 0, zIndex: 0, pointerEvents: "none" }}
    />
  );
}
