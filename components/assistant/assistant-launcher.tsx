"use client";

import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { OPEN_ASSISTANT_EVENT, type OpenAssistantDetail } from "@/lib/assistant/open";

import { AssistantBubble } from "./assistant-bubble";

const AssistantPanel = dynamic(() => import("./assistant-panel"), { ssr: false });

const SUPPRESSED_PREFIXES = ["/admin", "/oauth-consent", "/sign-in", "/sign-up"];

export function isAssistantSuppressed(pathname: string) {
  return SUPPRESSED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function AssistantLauncher() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [opened, setOpened] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null);
  const [pendingAutoSend, setPendingAutoSend] = useState(false);

  useEffect(() => {
    // A different user must not see the previous user's conversation or access result.
    setEnabled(false);
    setOpened(false);
    setPendingPrompt(null);
    setPendingAutoSend(false);
    if (!isLoaded || !isSignedIn) return;

    let cancelled = false;
    const controller = new AbortController();
    fetch("/api/assistant/access", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = await response.json().catch(() => null);
        return body?.enabled === true;
      })
      .then((nextEnabled) => {
        if (!cancelled) setEnabled(nextEnabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isLoaded, isSignedIn, userId]);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenAssistantDetail>).detail;
      setPendingPrompt(
        typeof detail?.prompt === "string" && detail.prompt.trim() ? detail.prompt.trim() : null,
      );
      setPendingAutoSend(detail?.autoSend === true);
      setOpened(true);
    };
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen);
  }, []);

  if (!enabled) return null;

  const suppressed = isAssistantSuppressed(pathname);
  if (opened) {
    return (
      <AssistantPanel
        suppressed={suppressed}
        initialPrompt={pendingPrompt}
        autoSend={pendingAutoSend}
        onPromptConsumed={() => {
          setPendingPrompt(null);
          setPendingAutoSend(false);
        }}
      />
    );
  }
  if (suppressed) return null;

  return <AssistantBubble onClick={() => setOpened(true)} />;
}
