"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * AI Elements Message Scroller, implemented with the browser's own scroller.
 * Messages from `@shadcn/react` target React 19; this app is on React 18, so
 * the behaviour is reproduced here: pin to the live edge, keep the person's
 * place after they scroll up, and follow streamed height changes.
 */
export function useConversationScroll() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    pinnedRef.current = true;
    setShowScrollButton(false);
    if (typeof viewport.scrollTo === "function") {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior });
    } else {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, []);

  const onScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
    pinnedRef.current = distance < 64;
    setShowScrollButton(distance >= 64);
  }, []);

  // Runs after every render so streaming content (which mutates the message
  // list in place) still keeps the live edge pinned.
  useEffect(() => {
    if (!pinnedRef.current) return;
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = viewport.scrollHeight;
  });

  useEffect(() => {
    const content = contentRef.current;
    if (!content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!pinnedRef.current) return;
      const viewport = viewportRef.current;
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return { viewportRef, contentRef, showScrollButton, onScroll, scrollToBottom };
}

export function ConversationScrollButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Back to bottom"
      tabIndex={visible ? 0 : -1}
      onClick={onClick}
      className={cn(
        "absolute bottom-3 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-md border border-border bg-background text-muted-foreground shadow-sm transition-all duration-200 hover:text-foreground",
        visible
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-2 opacity-0",
      )}
    >
      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
    </button>
  );
}
