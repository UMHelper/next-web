"use client";

import { isAbortError } from "@copilotkit/react-core/v2";
import {
  useAgent,
  useCopilotKit,
  useSuggestions,
} from "@copilotkit/react-core/v2/headless";
import { useCallback, useEffect, useMemo, useRef, useState, type RefCallback } from "react";

import { describeAssistantError } from "@/lib/assistant/error-message";
import { PANEL_WIDTH_DEFAULT } from "@/lib/assistant/panel-width";
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
  panelOpen,
  initialPrompt,
  autoSend,
  onPromptConsumed,
}: {
  onClose: () => void;
  notice: string | null;
  onClearNotice: () => void;
  panelRef?: RefCallback<HTMLElement>;
  panelOpen?: boolean;
  initialPrompt?: string | null;
  autoSend?: boolean;
  onPromptConsumed?: () => void;
}) {
  const { agent, isReady } = useAgent();
  const { copilotkit } = useCopilotKit();
  const { suggestions } = useSuggestions();

  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const consumedPrompt = useRef<string | null>(null);

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
    setDraft("");
    setError(null);
    onClearNotice();
  }, [agent, copilotkit, onClearNotice]);

  const clearAlert = () => {
    setError(null);
    if (notice) onClearNotice();
  };

  useEffect(() => {
    if (!initialPrompt || initialPrompt === consumedPrompt.current) return;

    if (!autoSend) {
      consumedPrompt.current = initialPrompt;
      setDraft(initialPrompt);
      onPromptConsumed?.();
      return;
    }

    if (!isReady || agent.isRunning) return;
    consumedPrompt.current = initialPrompt;
    onPromptConsumed?.();
    void send(initialPrompt);
  }, [agent.isRunning, autoSend, initialPrompt, isReady, onPromptConsumed, send]);

  // On desktop the page keeps a margin for the docked panel, so the site header
  // keeps its own style and is not covered. On mobile the panel covers the
  // viewport and the page behind it must not scroll.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const previousMargin = document.body.style.marginInlineEnd;
    const previousOverflow = document.body.style.overflow;
    const previousTransition = document.body.style.transition;
    const apply = () => {
      const mobile = window.innerWidth < 768;
      document.body.style.transition = "margin-inline-end 300ms cubic-bezier(0.4, 0, 0.2, 1)";
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
      document.body.style.transition = previousTransition;
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
      panelOpen={panelOpen}
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
    />
  );
}
