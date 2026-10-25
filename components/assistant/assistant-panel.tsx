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
  CHECK_PLAN_CONFLICTS_DESCRIPTION,
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
} from "@/lib/assistant/check-plan-conflicts";
import { describeAssistantError } from "@/lib/assistant/error-message";
import { EXAMPLE_QUESTIONS } from "@/lib/assistant/example-questions";
import { NAVIGATE_DESCRIPTION, navigateParameters } from "@/lib/assistant/navigation";
import { PAGE_CONTEXT_DESCRIPTION, describePage } from "@/lib/assistant/page-context";
import { PLAN_CONTEXT_DESCRIPTION, summarizePlan } from "@/lib/assistant/plan-summary";
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

  useAgentContext({ description: PLAN_CONTEXT_DESCRIPTION, value: summarizePlan(activePlan) });
  useAgentContext({ description: PAGE_CONTEXT_DESCRIPTION, value: page });
  useConfigureSuggestions(SUGGESTIONS);

  useFrontendTool(
    {
      name: "check_plan_conflicts",
      description: CHECK_PLAN_CONFLICTS_DESCRIPTION,
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
      description: NAVIGATE_DESCRIPTION,
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

export default function AssistantPanel({
  suppressed,
  initialPrompt,
  autoSend,
  onPromptConsumed,
}: {
  suppressed: boolean;
  initialPrompt?: string | null;
  autoSend?: boolean;
  onPromptConsumed?: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(true);
  const [mounted, setMounted] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const closing = useRef(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const attachPanel = useCallback((node: HTMLElement | null) => {
    panelRef.current = node;
  }, []);

  const shown = rendered && !suppressed;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || suppressed) return;
    const frame = window.requestAnimationFrame(() => {
      if (!closing.current) setOpen(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mounted, suppressed]);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const close = () => {
    closing.current = true;
    setNotice(null);
    setOpen(false);
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      setRendered(false);
      closeTimer.current = null;
    }, 300);
  };

  const reopen = () => {
    closing.current = false;
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setRendered(true);
    setOpen(false);
    window.requestAnimationFrame(() => setOpen(true));
  };

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
            panelOpen={open}
            initialPrompt={initialPrompt}
            autoSend={autoSend}
            onPromptConsumed={onPromptConsumed}
            onClose={close}
            notice={notice}
            onClearNotice={() => setNotice(null)}
          />
        ) : null}
      </CopilotKitProvider>
      <ResizeHandle visible={shown} panelRef={panelRef} />
      {open || suppressed ? null : <AssistantBubble onClick={reopen} />}
    </>,
    document.body,
  );
}
