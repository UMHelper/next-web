"use client";

import { useUser } from "@clerk/nextjs";
import dynamic from "next/dynamic";
import { useState } from "react";

import { isPilotMetadata } from "@/lib/assistant/pilot";
import type { LocalPlan } from "@/lib/timetable/store";

const AssistantPanel = dynamic(() => import("./assistant-panel"), { ssr: false });

export default function AssistantLauncher({ plan }: { plan: LocalPlan | undefined }) {
  const { isLoaded, user } = useUser();
  const [opened, setOpened] = useState(false);

  if (!isLoaded || !isPilotMetadata(user?.publicMetadata)) return null;
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
