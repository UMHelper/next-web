"use client";

import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { LocalPlan } from "@/lib/timetable/store";

const AssistantPanel = dynamic(() => import("./assistant-panel"), { ssr: false });

export default function AssistantLauncher({ plan }: { plan: LocalPlan | undefined }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setEnabled(false);
      return;
    }

    const controller = new AbortController();
    fetch("/api/assistant/access", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return false;
        const body = await response.json().catch(() => null);
        return body?.enabled === true;
      })
      .then((nextEnabled) => setEnabled(nextEnabled))
      .catch(() => setEnabled(false));

    return () => controller.abort();
  }, [isLoaded, isSignedIn]);

  if (!enabled) return null;
  if (opened) return <AssistantPanel plan={plan} />;

  return (
    <button
      type="button"
      onClick={() => setOpened(true)}
      className="fixed bottom-6 right-6 z-40 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground shadow-lg"
    >
      AI 选课助手
    </button>
  );
}
