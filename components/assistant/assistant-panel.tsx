"use client";

import {
  CopilotKitProvider,
  useAgentContext,
  useConfigureSuggestions,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import {
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
} from "@/lib/assistant/check-plan-conflicts";
import { describeAssistantError } from "@/lib/assistant/error-message";
import { EXAMPLE_QUESTIONS } from "@/lib/assistant/example-questions";
import { navigateParameters } from "@/lib/assistant/navigation";
import { PAGE_CONTEXT_DESCRIPTION, describePage } from "@/lib/assistant/page-context";
import { summarizePlan } from "@/lib/assistant/plan-summary";
import { getSections } from "@/lib/timetable/catalog-client";

import AssistantChat from "./assistant-chat";
import { AssistantBubble } from "./assistant-bubble";
import ResizeHandle from "./resize-handle";
import { useNavigateTool } from "./use-navigate-tool";

// FloatingPlanner keys its offset off this attribute; the name is repeated literally in its Tailwind classes.
const OPEN_ATTRIBUTE = "data-assistant-open";

const SUGGESTIONS = {
  available: "before-first-message" as const,
  suggestions: EXAMPLE_QUESTIONS.map((question) => ({ title: question, message: question })),
};

/**
 * Registers the page/timetable context and the read-only frontend tools. Kept outside
 * AssistantChat so closing the panel does not unregister anything.
 */
function AssistantTools() {
  const { activePlan } = useTimetablePlanner();
  const planRef = useRef(activePlan);
  planRef.current = activePlan;

  const pathname = usePathname();
  const page = useMemo(() => JSON.stringify(describePage(pathname)), [pathname]);

  useAgentContext({
    description: "The student's active timetable plan (read-only)",
    value: summarizePlan(activePlan),
  });
  useAgentContext({ description: PAGE_CONTEXT_DESCRIPTION, value: page });
  useConfigureSuggestions(SUGGESTIONS);

  useFrontendTool(
    {
      name: "check_plan_conflicts",
      description:
        "Check whether one section of a course taught by an instructor clashes with the student's current timetable. Read-only; never changes the timetable.",
      parameters: checkPlanConflictsParameters,
      handler: async (input) =>
        runCheckPlanConflicts(planRef.current?.payload.sections ?? [], input, getSections),
    },
    [],
  );

  const navigate = useNavigateTool();
  useFrontendTool(
    {
      name: "navigate",
      description:
        "Open a page on this site for the student: a course, an instructor, an instructor's reviews for a course, the catalog, or their timetable. Only call it when the student asks to open or go to a page. It cannot open other sites and never changes the timetable.",
      parameters: navigateParameters,
      handler: (input, context) =>
        navigate(input, { signal: context?.signal, agent: context?.agent }),
      followUp: true,
      reconnectBehavior: "passive",
    },
    [],
  );

  return null;
}

export default function AssistantPanel({ suppressed }: { suppressed: boolean }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const attachPanel = useCallback((node: HTMLElement | null) => {
    panelRef.current = node;
  }, []);

  const shown = open && !suppressed;

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!shown) return;
    const root = document.documentElement;
    root.setAttribute(OPEN_ATTRIBUTE, "");
    return () => root.removeAttribute(OPEN_ATTRIBUTE);
  }, [shown]);

  if (!mounted) return null;

  return createPortal(
    <>
      <CopilotKitProvider
        runtimeUrl="/api/copilotkit"
        enableInspector={false}
        onError={({ error }) => setNotice(describeAssistantError(error.message))}
      >
        <AssistantTools />
        {shown ? (
          <AssistantChat
            panelRef={attachPanel}
            onClose={() => {
              setNotice(null);
              setOpen(false);
            }}
            notice={notice}
            onClearNotice={() => setNotice(null)}
          />
        ) : null}
      </CopilotKitProvider>
      <ResizeHandle visible={shown} panelRef={panelRef} />
      {open || suppressed ? null : <AssistantBubble onClick={() => setOpen(true)} />}
    </>,
    document.body,
  );
}
