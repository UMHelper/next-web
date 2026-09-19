import React, { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type MasonryProps = {
  children?: ReactNode;
  col?: number;
  className?: string;
};

export const Masonry = ({ children, col = 3, className = "" }: MasonryProps) => {
  const gridClass =
    col >= 3
      ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3"
      : col === 2
        ? "grid-cols-1 md:grid-cols-2"
        : "grid-cols-1";

  return (
    <div className={cn("grid items-start gap-4", gridClass, className)}>
      {children}
    </div>
  );
};
