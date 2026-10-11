"use client";

import { useEffect, useState } from "react";

import { loadIsland } from "@/lib/island-loader";
import { useEffectiveSkin } from "@/lib/use-skin";

export type Island = Awaited<ReturnType<typeof loadIsland>>;

export function useIsland(): Island | null {
  const active = useEffectiveSkin() === "island";
  const [lib, setLib] = useState<Island | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    loadIsland()
      .then((mod) => {
        if (!cancelled) setLib(mod);
      })
      .catch(() => {
        // 库加载失败时保持仅 token 皮肤，调用方回落到默认组件
      });
    return () => {
      cancelled = true;
    };
  }, [active]);

  return active ? lib : null;
}
