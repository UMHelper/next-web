"use client";

import { TreeIcon } from "naive-icons";
import { useEffect, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { setSkin, type Skin } from "@/lib/skin";
import { useSkin } from "@/lib/use-skin";
import { cn } from "@/lib/utils";

export const SKIN_OPTIONS: { value: Skin; label: string }[] = [
  { value: "default", label: "紙本 Paper" },
  { value: "island", label: "卡通 Cartoon" },
];

// 与 ThemeOptions 一致：挂载前一律按「未选中」渲染，避免 hydration 期间高亮错误的项
function useMountedSkin(): Skin | undefined {
  const skin = useSkin();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? skin : undefined;
}

export function SkinSwitcher() {
  const skin = useMountedSkin();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex items-center outline-none" aria-label="Skin">
          <TreeIcon size={24} color="currentColor" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup value={skin ?? ""} onValueChange={(value) => setSkin(value as Skin)}>
          {SKIN_OPTIONS.map(({ value, label }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SkinOptions({ className }: { className?: string }) {
  const skin = useMountedSkin();

  return (
    <div role="radiogroup" aria-label="Skin" className={cn("flex flex-col gap-1", className)}>
      {SKIN_OPTIONS.map(({ value, label }) => {
        const active = skin === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setSkin(value)}
            className={cn(
              "flex items-center gap-2 rounded-item px-2 py-2 text-left text-sm text-foreground hover:bg-accent",
              active && "bg-accent font-medium text-brand-strong",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
