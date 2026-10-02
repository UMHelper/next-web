"use client";

import React, { useEffect, useRef } from "react";

import { requestAd } from "@/lib/ads/request-ad";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

/**
 * A single AdSense unit. The AdSense ids arrive as props (built on the server by
 * `createAdConfig`) so the server and the client always agree. Reading the
 * public AdSense env vars here would depend on build-time inlining and make the
 * client render `null` where the server rendered a unit.
 */
export function AdSlot({
  client,
  slot,
  className,
}: {
  client: string;
  slot: string;
  className?: string;
}) {
  const insRef = useRef<HTMLModElement>(null);

  useEffect(() => {
    if (!client || !slot) return;
    if (!insRef.current) return;
    window.adsbygoogle = window.adsbygoogle ?? [];
    requestAd(insRef.current, window.adsbygoogle);
  }, [client, slot]);

  if (!client || !slot) return null;

  return (
    <div
      className={cn(
        "flex flex-col rounded-lg border border-dashed border-border bg-surface-subtle/40 p-1",
        className,
      )}
    >
      <span className="px-1 pb-1 text-[10px] uppercase tracking-wider text-foreground-subtle">
        Advertisement
      </span>
      <ins
        ref={insRef}
        className="adsbygoogle block min-h-[120px] w-full overflow-hidden md:min-h-[250px]"
        data-ad-client={client}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  );
}

export default AdSlot;
