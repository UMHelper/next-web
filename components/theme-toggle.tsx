"use client";

import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type ThemeValue = "light" | "dark" | "system";

export const THEME_OPTIONS: { value: ThemeValue; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
];

/**
 * 三选项列表：桌面下拉之外，移动端侧边栏直接复用。
 * 不做 mounted 守卫 —— 服务端与首次客户端渲染的 theme 都是 undefined，
 * 两边输出一致，因此不会产生 hydration 不匹配。
 */
export function ThemeOptions({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {THEME_OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
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

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // resolvedTheme 在挂载前是 undefined：先渲染等尺寸占位，避免图标在服务端与客户端不一致
  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden />;
  }

  const ActiveIcon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2 text-foreground" aria-label="Switch theme">
          <ActiveIcon size={20} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEME_OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => setTheme(value)} className="gap-2">
            <Icon size={16} strokeWidth={2} />
            <span>{label}</span>
            {theme === value ? <Check size={14} className="ms-auto" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
