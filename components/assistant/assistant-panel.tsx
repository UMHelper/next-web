"use client";

import {
  CopilotKitProvider,
  useAgentContext,
  useConfigureSuggestions,
  useFrontendTool,
  type Message,
} from "@copilotkit/react-core/v2";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { describeAssistantError } from "@/lib/assistant/error-message";
import { DEFAULT_HISTORY_TURNS, prepareRunMessages } from "@/lib/assistant/run-messages";
import type { RunMessage } from "@/lib/assistant/conversation";
import { EXAMPLE_QUESTIONS } from "@/lib/assistant/example-questions";
import { NAVIGATE_DESCRIPTION, navigateParameters } from "@/lib/assistant/navigation";
import { PAGE_CONTEXT_DESCRIPTION, describePage } from "@/lib/assistant/page-context";
import { useTimetableContext } from "./use-timetable-context";

import { CatalogFilterProvider } from "./catalog-filter-store";
import AssistantChat from "./assistant-chat";
import { AssistantBubble } from "./assistant-bubble";
import ResizeHandle from "./resize-handle";
import { useCourseDetailToolRender } from "./course-detail-tool-render";
import { useCourseSectionsToolRender } from "./course-sections-tool-render";
import { useTimetablePreviewToolRender } from "./timetable-preview-tool-render";
import { useSearchCatalogToolRender } from "./search-catalog-tool-render";
import { useCatalogResultsTool } from "./use-catalog-results-tool";
import { useDiscussedCourses } from "./use-discussed-courses";
import { useVisibleBlocks } from "./use-visible-blocks";
import { useConflictVerification } from "./use-conflict-verification";
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
  const pathname = usePathname();
  const page = useMemo(() => JSON.stringify(describePage(pathname)), [pathname]);

  useTimetableContext();
  useAgentContext({ description: PAGE_CONTEXT_DESCRIPTION, value: page });
  useConfigureSuggestions(SUGGESTIONS);

  const navigate = useNavigateTool();
  useCatalogResultsTool();
  useDiscussedCourses();
  useVisibleBlocks();
  useConflictVerification();
  useSearchCatalogToolRender();
  useCourseDetailToolRender();
  useCourseSectionsToolRender();
  useTimetablePreviewToolRender();

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
  openToken,
  onPromptConsumed,
}: {
  suppressed: boolean;
  initialPrompt?: string | null;
  autoSend?: boolean;
  openToken?: number;
  onPromptConsumed?: () => void;
}) {
  const pathname = usePathname();
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

  const messageFilter = useCallback(
    (messages: Message[]) =>
      prepareRunMessages(messages as RunMessage[], DEFAULT_HISTORY_TURNS) as Message[],
    [],
  );

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

  const lastOpenToken = useRef(openToken);
  useEffect(() => {
    if (openToken === undefined || openToken === lastOpenToken.current) return;
    lastOpenToken.current = openToken;
    if (!open) reopen();
  }, [open, openToken]);

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
        messageFilter={messageFilter}
        onError={({ error }) => setNotice(describeAssistantError(error.message))}
      >
        <CatalogFilterProvider>
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
        </CatalogFilterProvider>
      </CopilotKitProvider>
      <ResizeHandle visible={shown} panelRef={panelRef} />
      {open || suppressed || pathname === "/" ? null : <AssistantBubble onClick={reopen} />}
    </>,
    document.body,
  );
}
