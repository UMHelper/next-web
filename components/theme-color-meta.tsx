"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";

import { useEffectiveSkin } from "@/lib/use-skin";

const COLORS = {
  default: { light: "#FFFFFF", dark: "#020817" },
  island: { light: "#F8F8F0", dark: "#171F1E" },
} as const;

/**
 * 直接改写 head 里那枚静态 meta，而不是用 React 渲染 meta：
 * 不依赖 React 的 head 提升行为，也不会产生重复 meta。
 * enableSystem 时 next-themes 已把系统偏好解析进 resolvedTheme，
 * 因此 system 模式天然跟随，无需自己订阅 matchMedia。
 */
export function ThemeColorMeta() {
  const { resolvedTheme } = useTheme();
  const skin = useEffectiveSkin();

  useEffect(() => {
    const meta = document.querySelector("meta[name='theme-color']");
    if (!meta) return;
    meta.setAttribute("content", COLORS[skin][resolvedTheme === "dark" ? "dark" : "light"]);
  }, [resolvedTheme, skin]);

  return null;
}
