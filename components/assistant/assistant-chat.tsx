"use client";

import {
  isAbortError,
  useRenderToolCall,
  type ToolCall,
  type ToolMessage,
} from "@copilotkit/react-core/v2";
import {
  useAgent,
  useCopilotKit,
  useSuggestions,
} from "@copilotkit/react-core/v2/headless";
import { useCallback, useEffect, useMemo, useState, type RefCallback } from "react";

import { describeAssistantError } from "@/lib/assistant/error-message";
import { PANEL_WIDTH_DEFAULT } from "@/lib/assistant/panel-width";
import { RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";

import { useCatalogFilterStore } from "./catalog-filter-store";
import { AssistantChatView, type ChatSuggestion } from "./assistant-chat-view";
import { PANEL_WIDTH_VAR } from "./resize-handle";

function newMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function AssistantChat({
  onClose,
  notice,
  onClearNotice,
  panelRef,
}: {
  onClose: () => void;
  notice: string | null;
  onClearNotice: () => void;
  panelRef?: RefCallback<HTMLElement>;
}) {
  const { agent, isReady } = useAgent();
  const { copilotkit } = useCopilotKit();
  const catalogFilterStore = useCatalogFilterStore();
  const { suggestions } = useSuggestions();
  const renderToolCall = useRenderToolCall();

  const toolRenderer = useMemo(
    () => ({
      names: RICH_TOOL_NAMES,
      render: (call: ToolCall, result: ToolMessage | undefined) =>
        renderToolCall({ toolCall: call, toolMessage: result }),
    }),
    [renderToolCall],
  );

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const suggestionList = useMemo<ChatSuggestion[]>(() => {
    return suggestions
      .filter((suggestion) => !suggestion.isLoading && suggestion.message.trim())
      .map((suggestion) => ({
        title: suggestion.title || suggestion.message,
        message: suggestion.message,
      }))
      .slice(0, 4);
  }, [suggestions]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || !isReady || agent.isRunning) return;
      setError(null);
      onClearNotice();
      setDraft("");
      agent.addMessage({ id: newMessageId(), role: "user", content: text });
      try {
        await copilotkit.runAgent({ agent });
      } catch (cause) {
        if (isAbortError(cause)) return;
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(describeAssistantError(message));
      }
    },
    [agent, copilotkit, isReady, onClearNotice],
  );

  const stop = useCallback(() => {
    copilotkit.stopAgent({ agent });
  }, [agent, copilotkit]);

  const startNewChat = useCallback(() => {
    if (agent.isRunning) copilotkit.stopAgent({ agent });
    agent.setMessages([]);
    catalogFilterStore?.reset();
    setDraft("");
    setError(null);
    onClearNotice();
  }, [agent, catalogFilterStore, copilotkit, onClearNotice]);

  const clearAlert = () => {
    setError(null);
    if (notice) onClearNotice();
  };

  // Match the old sidebar's layout contract: on desktop the page keeps a
  // margin for the panel; on mobile the panel covers the viewport and the
  // page behind it must not scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const previousMargin = document.body.style.marginInlineEnd;
    const previousOverflow = document.body.style.overflow;
    const apply = () => {
      const mobile = window.innerWidth < 768;
      document.body.style.marginInlineEnd = mobile
        ? ""
        : `var(${PANEL_WIDTH_VAR}, ${PANEL_WIDTH_DEFAULT}px)`;
      document.body.style.overflow = mobile ? "hidden" : previousOverflow;
    };
    apply();
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      document.body.style.marginInlineEnd = previousMargin;
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <AssistantChatView
      panelRef={panelRef}
      messages={agent.messages}
      suggestions={suggestionList}
      isRunning={agent.isRunning}
      isReady={isReady}
      draft={draft}
      alert={error ?? notice}
      onDraftChange={setDraft}
      onSend={(text) => void send(text)}
      onStop={stop}
      onNewChat={startNewChat}
      onClose={onClose}
      onClearAlert={clearAlert}
      toolRenderer={toolRenderer}
    />
  );
}
