"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import {
  MAX_NAVIGATIONS_PER_MESSAGE,
  NAVIGATION_TIMEOUT_MS,
  buildNavigationPath,
  navigationsSinceLastUserMessage,
  parseDestination,
  samePage,
  verifyDestination,
  type NavigateResult,
} from "@/lib/assistant/navigation";
import { describePage } from "@/lib/assistant/page-context";

type Landing = { pathname: string } | { status: "timeout" | "cancelled" };
type ToolContext = {
  signal?: AbortSignal;
  agent?: { messages: ReadonlyArray<{ role: string; toolCalls?: ReadonlyArray<{ function: { name: string } }> }> };
};

export function useNavigateTool() {
  const router = useRouter();
  const pathname = usePathname();
  const routerRef = useRef(router);
  routerRef.current = router;
  const pathnameRef = useRef(pathname);
  const listeners = useRef(new Set<(pathname: string | null) => void>());
  const busy = useRef(false);
  const mounted = useRef(false);

  // Passive on purpose: useAgentContext publishes the page in a layout effect, which has already run
  // for this commit, so the follow-up run CopilotKit starts after we resolve carries the new page.
  useEffect(() => {
    pathnameRef.current = pathname;
    for (const listener of [...listeners.current]) listener(pathname);
  }, [pathname]);

  useEffect(() => {
    mounted.current = true;
    const currentListeners = listeners.current;
    return () => {
      mounted.current = false;
      for (const listener of [...currentListeners]) listener(null);
    };
  }, []);

  return useCallback(async (input: unknown, context: ToolContext = {}): Promise<NavigateResult> => {
    const destination = parseDestination(input);
    if (!destination) return { status: "invalid_destination" };
    if (context.agent && navigationsSinceLastUserMessage(context.agent.messages) > MAX_NAVIGATIONS_PER_MESSAGE) {
      return { status: "limit_reached" };
    }
    if (busy.current) return { status: "busy" };

    const path = buildNavigationPath(destination);
    const target = describePage(path);
    const isCurrent = () => samePage(describePage(pathnameRef.current), target);
    if (isCurrent()) return { status: "already_here", page: target };

    busy.current = true;
    try {
      const existence = await verifyDestination(destination);
      if (existence === "missing") return { status: "not_found" };
      if (existence === "unavailable") return { status: "unavailable" };
      if (isCurrent()) return { status: "already_here", page: target };
      if (!mounted.current || context.signal?.aborted) return { status: "cancelled" };

      const landing = new Promise<Landing>((resolve) => {
        const finish = (result: Landing) => {
          clearTimeout(timer);
          listeners.current.delete(onPathname);
          context.signal?.removeEventListener("abort", onAbort);
          resolve(result);
        };
        const onPathname = (next: string | null) =>
          finish(next === null ? { status: "cancelled" } : { pathname: next });
        const onAbort = () => finish({ status: "cancelled" });
        const timer = setTimeout(() => finish({ status: "timeout" }), NAVIGATION_TIMEOUT_MS);
        listeners.current.add(onPathname);
        context.signal?.addEventListener("abort", onAbort, { once: true });
      });
      routerRef.current.push(path);

      const result = await landing;
      if ("status" in result) return result;
      const page = describePage(result.pathname);
      return { status: samePage(page, target) ? "navigated" : "landed_elsewhere", page };
    } finally {
      busy.current = false;
    }
  }, []);
}
