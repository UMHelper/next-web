"use client";

import React, { useEffect, useRef } from "react";

import { getAdsenseClientId, getAdsenseSlotId } from "@/lib/ads/ad-config";
import { requestAd } from "@/lib/ads/request-ad";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({ className }: { className?: string }) {
  const insRef = useRef<HTMLModElement>(null);
  const client = getAdsenseClientId();
  const slot = getAdsenseSlotId();

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
        "flex flex-col rounded-lg border border-dashed border-slate-200 bg-slate-50/40 p-1",
        className,
      )}
    >
      <span className="px-1 pb-1 text-[10px] uppercase tracking-wider text-slate-400">
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
