"use client";

import { Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export type ThemeValue = "light" | "dark";

export const THEME_OPTIONS: { value: ThemeValue; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/**
 * Light / Dark 两选项列表，移动端侧边栏复用。
 *
 * 必须做 mounted 守卫：next-themes 在服务端拿不到 localStorage，`theme` 是
 * undefined；而首次客户端渲染会同步解析出 localStorage 或系统偏好。若不守卫，
 * 服务端输出「两行都未选中」，hydration 的首次渲染却把其中一行标为选中，造成
 * hydration mismatch（属性不一致告警，并短暂高亮错误的行）。因此挂载前一律按
 * 未选中渲染，挂载后再点亮真实选中项 —— 服务端与客户端首次渲染的 DOM 因此一致。
 *
 * 默认主题是「跟随系统」（见 `components/providers/theme-provider.tsx` 的
 * `defaultTheme="system"`），此时 `theme` 为 "system"，所以选中项取 `resolvedTheme`。
 */
export function ThemeOptions({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const effective = mounted ? (theme === "system" ? resolvedTheme : theme) : undefined;

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={cn("flex flex-col gap-1", className)}
    >
      {THEME_OPTIONS.map(({ value, label, Icon }) => {
        const active = effective === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setTheme(value)}
            className={cn(
              "flex items-center gap-2 rounded px-2 py-2 text-left text-sm text-foreground hover:bg-accent",
              active && "bg-accent font-medium text-brand-strong",
            )}
          >
            <Icon size={18} strokeWidth={2} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 单击即在浅色 / 深色之间切换，不带下拉菜单。
 *
 * 未显式选择过时主题跟随系统（由 `defaultTheme="system"` 决定），此时图标显示
 * `resolvedTheme` 对应的那一个；用户一旦点击，就写入自己的选择并持久化。
 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // resolvedTheme 在挂载前是 undefined：先渲染等尺寸占位，避免图标在服务端与客户端不一致
  if (!mounted) {
    return (
      <div className="flex items-center" aria-hidden>
        <span className="h-5 w-5" />
      </div>
    );
  }

  const isDark = resolvedTheme === "dark";
  const Icon = isDark ? Moon : Sun;
  const label = isDark ? "Switch to light theme" : "Switch to dark theme";

  return (
    // 与相邻的 search 按钮同一样式：无内边距、无 hover 底色、无聚焦描边
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="flex items-center outline-none"
      aria-label={label}
    >
      <Icon size={20} strokeWidth={2} />
    </button>
  );
}
