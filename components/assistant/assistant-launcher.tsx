"use client";

import { useAuth } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import type { LocalPlan } from "@/lib/timetable/store";

import { ASSISTANT_PILL_CLASS } from "./launcher-pill";

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
  }, [isLoaded, isSignedIn]);

  if (!enabled) return null;
  if (opened) return <AssistantPanel plan={plan} />;

  return (
    <button
      type="button"
      onClick={() => setOpened(true)}
      className={ASSISTANT_PILL_CLASS}
    >
      AI 选课助手
    </button>
  );
}
