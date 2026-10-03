"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import React from "react";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      // 未显式选择过的访客跟随系统偏好（prefers-color-scheme）；一旦用户点击切换，
      // next-themes 会把选择写入 localStorage 并优先使用它。
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="umeh-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
