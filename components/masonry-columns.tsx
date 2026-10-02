"use client";

import React, { useEffect, useState, type ReactNode } from "react";

import { columnsForWidth, splitIntoColumns } from "@/lib/masonry-split";

/**
 * Browsers without native CSS grid lanes (everything but Safari 26.4+/iOS 26.4+
 * today) get a real waterfall by re-grouping the cards into round-robin
 * columns, exactly like the original Masonry implementation — so the columns
 * still read left to right instead of the top-to-bottom order CSS multi-column
 * would produce.
 *
 * The server (and the first client render) always emits the plain list that the
 * grid container lays out, so hydration matches and browsers with native lanes
 * or without JavaScript keep the grid untouched.
 */
export function MasonryColumns({ children, col }: { children?: ReactNode; col: number }) {
  const items = React.Children.toArray(children);
  const [columns, setColumns] = useState<number | null>(null);

  useEffect(() => {
    const supportsLanes =
      typeof CSS !== "undefined" &&
      typeof CSS.supports === "function" &&
      CSS.supports("display", "grid-lanes");

    if (supportsLanes) {
      setColumns(null);
      return;
    }

    const update = () => setColumns(columnsForWidth(col, window.innerWidth));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [col]);

  if (columns === null || columns <= 1) return <>{items}</>;

  return (
    <>
      {splitIntoColumns(items, columns).map((group, index) => (
        <div key={`lane-${index}`} className="flex flex-col gap-4">
          {group}
        </div>
      ))}
    </>
  );
}

export default MasonryColumns;
