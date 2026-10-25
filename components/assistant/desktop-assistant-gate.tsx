"use client";

import { useSyncExternalStore, type ReactNode } from "react";

// The 380px default sidebar leaves too little page below this width. This is a layout policy, not device detection.
export const ASSISTANT_DESKTOP_QUERY = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(ASSISTANT_DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

const isDesktop = () => window.matchMedia(ASSISTANT_DESKTOP_QUERY).matches;

// The server and the hydration pass both render nothing, so the first client frame always matches the HTML.
const isDesktopOnServer = () => false;

export default function DesktopAssistantGate({ children }: { children: ReactNode }) {
  const desktop = useSyncExternalStore(subscribe, isDesktop, isDesktopOnServer);
  return desktop ? <>{children}</> : null;
}
