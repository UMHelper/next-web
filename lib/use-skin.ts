"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

import { effectiveSkin, getSkin, subscribe, type Skin } from "@/lib/skin";

export function useSkin(): Skin {
  return useSyncExternalStore(subscribe, getSkin, () => "default" as const);
}

export function useEffectiveSkin(): Skin {
  const chosen = useSkin();
  const pathname = usePathname();
  return effectiveSkin(pathname, chosen);
}
