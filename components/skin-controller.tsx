"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { applySkinAttribute, effectiveSkin, getSkin, subscribe } from "@/lib/skin";

export function SkinController() {
  const pathname = usePathname();

  useEffect(() => {
    const apply = () => applySkinAttribute(effectiveSkin(pathname, getSkin()));
    apply();
    return subscribe(apply);
  }, [pathname]);

  return null;
}
