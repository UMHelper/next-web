import React, { type ReactNode } from "react";

import { cn } from "@/lib/utils";

type MasonryProps = {
  children?: ReactNode;
  col?: number;
  className?: string;
};

export const Masonry = ({ children, col = 3, className = "" }: MasonryProps) => {
  const columnsClass =
    col >= 3
      ? "columns-1 md:columns-2 xl:columns-3"
      : col === 2
        ? "columns-1 md:columns-2"
        : "columns-1";

  return (
    <div className={cn(columnsClass, "gap-4 [&>*]:mb-4 [&>*]:break-inside-avoid", className)}>
      {children}
    </div>
  );
};
