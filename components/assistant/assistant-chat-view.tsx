"use client";

import {
  AlertCircle,
  ArrowUpRight,
  Cat,
  Check,
  Copy,
  MessageCircle,
  RotateCcw,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type RefCallback,
} from "react";

import type {
  AssistantMessage,
  Message,
  ReasoningMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from "@copilotkit/react-core/v2";

import { Bubble, BubbleContent } from "@/components/ai-elements/bubble";
import {
  ConversationScrollButton,
  useConversationScroll,
} from "@/components/ai-elements/conversation";
import { Message as ChatMessage, MessageContent } from "@/components/ai-elements/message";
import { PromptInput } from "@/components/ai-elements/prompt-input";
import { Response } from "@/components/ai-elements/response";
import { dedupeCalls, ToolRow, ToolTrace } from "@/components/ai-elements/tool";
import { EXAMPLE_QUESTIONS } from "@/lib/assistant/example-questions";
import { cn } from "@/lib/utils";

type AssistantPart = AssistantMessage | ReasoningMessage;

type Turn = {
  user?: UserMessage;
  assistant: AssistantPart[];
};

export type ChatSuggestion = { title: string; message: string };

export type AssistantChatViewProps = {
  messages: Message[];
  suggestions: ChatSuggestion[];
  isRunning: boolean;
  isReady: boolean;
  draft: string;
  alert: string | null;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onNewChat: () => void;
  onClose: () => void;
  onClearAlert: () => void;
  panelRef?: RefCallback<HTMLElement>;
  toolRenderer?: {
    names: ReadonlySet<string>;
    render: (call: ToolCall, result: ToolMessage | undefined) => ReactNode;
  };
};

function buildTurns(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.role === "user") {
      turns.push({ user: message, assistant: [] });
    } else if (message.role === "assistant" || message.role === "reasoning") {
      if (turns.length === 0) turns.push({ assistant: [] });
      turns[turns.length - 1].assistant.push(message);
    }
  }
  return turns;
}

function userText(content: UserMessage["content"]): string {
  if (typeof content === "string") return content;
  return content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function ThinkingRow() {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
      <span className="flex items-center gap-1" aria-hidden>
        <span className="h-1.5 w-1.5 rounded-full bg-brand motion-safe:animate-bounce [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-brand motion-safe:animate-bounce [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 rounded-full bg-brand motion-safe:animate-bounce" />
      </span>
      Thinking…
    </div>
  );
}

function splitAssistantProse(content: string): string[] {
  return content
    .split(/(?<=\.)(?=[A-Z])/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function CopyAction({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    const clipboard = navigator.clipboard;
    if (!clipboard) return;
    void clipboard
      .writeText(text)
      .then(() => setCopied(true))
      .catch(() => {});
  };

  const label = copied ? "Copied" : "Copy";
  return (
    <button
      type="button"
      aria-label={copied ? "Copied reply" : "Copy reply"}
      onClick={copy}
      className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3" aria-hidden /> : <Copy className="h-3 w-3" aria-hidden />}
      {label}
    </button>
  );
}

function AssistantTurn({
  parts,
  results,
  isRunning,
  isLast,
  toolRenderer,
}: {
  parts: AssistantPart[];
  results: Map<string, ToolMessage>;
  isRunning: boolean;
  isLast: boolean;
  toolRenderer?: AssistantChatViewProps["toolRenderer"];
}) {
  const dedupedCalls = useMemo(() => {
    const collected: ToolCall[] = [];
    for (const part of parts) {
      if (part.role !== "assistant") continue;
      for (const call of part.toolCalls ?? []) collected.push(call);
    }
    return dedupeCalls(collected, results);
  }, [parts, results]);

  const dedupedIds = useMemo(
    () => new Set(dedupedCalls.map((call) => call.id)),
    [dedupedCalls],
  );

  const dedupedById = useMemo(
    () => new Map(dedupedCalls.map((call) => [call.id, call])),
    [dedupedCalls],
  );

  const turnActive = isRunning && isLast;

  const isRichCall = useCallback(
    (call: ToolCall) =>
      Boolean(
        toolRenderer?.names.has(call.function.name) &&
          (results.get(call.id) || turnActive),
      ),
    [toolRenderer, results, turnActive],
  );

  const traceCalls = useMemo(
    () => dedupedCalls.filter((call) => !isRichCall(call)),
    [dedupedCalls, isRichCall],
  );

  // One action row per turn, not one under every assistant fragment.
  const lastText = useMemo(() => {
    for (let index = parts.length - 1; index >= 0; index -= 1) {
      const part = parts[index];
      if (part.role === "assistant" && part.content?.trim()) return part.content;
    }
    return "";
  }, [parts]);

  const streamingHere = isRunning && isLast;
  const seenRichIds = new Set<string>();

  return (
    <div className="space-y-2 animate-in fade-in duration-200">
      {traceCalls.length > 0 ? (
        <ToolTrace calls={traceCalls} results={results} isRunning={turnActive} />
      ) : null}
      {parts.map((part) => {
        if (part.role === "reasoning") return null;

        const text = part.content?.trim() ?? "";
        const richBlocks =
          part.toolCalls?.flatMap((rawCall) => {
            const call = dedupedById.get(rawCall.id) ?? rawCall;
            if (!dedupedIds.has(call.id) || seenRichIds.has(call.id) || !isRichCall(call) || !toolRenderer) {
              return [];
            }
            seenRichIds.add(call.id);
            return [
              <div key={`rich-${call.id}`} className="space-y-1.5">
                <ToolRow
                  call={call}
                  result={results.get(call.id)}
                  isRunning={turnActive}
                  announce
                />
                {toolRenderer.render(call, results.get(call.id))}
              </div>,
            ];
          }) ?? [];

        if (!text && richBlocks.length === 0) return null;

        return (
          <div key={part.id} className="space-y-2">
            {text
              ? splitAssistantProse(part.content ?? "").map((segment, index) => (
                  <Response key={`${part.id}-${index}`}>{segment}</Response>
                ))
              : null}
            {richBlocks}
          </div>
        );
      })}
      {lastText && !streamingHere ? <CopyAction text={lastText} /> : null}
    </div>
  );
}

function UserTurn({ message }: { message: UserMessage }) {
  return (
    <ChatMessage align="end" className="justify-end animate-in fade-in duration-200">
      <MessageContent className="items-end">
        <Bubble align="end" variant="brand">
          <BubbleContent className="rounded-br-md whitespace-pre-wrap">
            {userText(message.content)}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </ChatMessage>
  );
}

function Welcome({
  suggestions,
  onPick,
  disabled,
}: {
  suggestions: ChatSuggestion[];
  onPick: (message: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col pt-1 pb-4 animate-in fade-in duration-300">
      <h3 className="text-base font-semibold text-foreground">How can I help?</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Ask about courses, professors, reviews, class times, or timetable conflicts.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        查課程、教授、評價、上課時間，或檢查課表衝突。
      </p>
      <div className="mt-5">
        <p className="text-xs font-medium text-muted-foreground">Try asking</p>
        <div className="mt-2 space-y-2">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${suggestion.message}-${index}`}
              type="button"
              disabled={disabled}
              onClick={() => onPick(suggestion.message)}
              className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm leading-snug text-foreground transition-colors hover:border-brand/40 hover:bg-surface-subtle disabled:pointer-events-none disabled:opacity-50"
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
              <span className="min-w-0 flex-1">{suggestion.title}</span>
              <ArrowUpRight
                className="h-3.5 w-3.5 shrink-0 text-foreground-subtle transition-colors group-hover:text-brand"
                aria-hidden
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AssistantChatView({
  messages,
  suggestions,
  isRunning,
  isReady,
  draft,
  alert,
  onDraftChange,
  onSend,
  onStop,
  onNewChat,
  onClose,
  onClearAlert,
  panelRef,
  toolRenderer,
}: AssistantChatViewProps) {
  const { viewportRef, contentRef, showScrollButton, onScroll, scrollToBottom } =
    useConversationScroll();

  const turns = useMemo(() => buildTurns(messages), [messages]);

  const toolResults = useMemo(() => {
    const results = new Map<string, ToolMessage>();
    for (const message of messages) {
      if (message.role === "tool") results.set(message.toolCallId, message);
    }
    return results;
  }, [messages]);

  const suggestionList = useMemo(() => {
    if (suggestions.length > 0) return suggestions.slice(0, 4);
    return EXAMPLE_QUESTIONS.map((question) => ({ title: question, message: question }));
  }, [suggestions]);

  const lastMessage = messages[messages.length - 1];
  const awaitingReply =
    isRunning &&
    (!lastMessage ||
      lastMessage.role === "user" ||
      lastMessage.role === "tool" ||
      (lastMessage.role === "assistant" &&
        !lastMessage.content?.trim() &&
        (lastMessage.toolCalls?.length ?? 0) === 0));

  return (
    <aside
      ref={panelRef}
      aria-label="AI Course Helper"
      className="fixed inset-y-0 right-0 z-[1200] m-0 flex w-full flex-col border-l border-border bg-background text-foreground md:w-[var(--assistant-width,380px)]"
    >
      {/* 65px matches the site navbar at md so its bottom rule continues across the panel. */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border px-4 pb-3 pt-[calc(0.75rem_+_env(safe-area-inset-top))] md:h-[65px] md:pb-0 md:pt-0">
        <Cat className="h-5 w-5 shrink-0 text-brand-logo" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight text-foreground">
            AI Course Helper
          </h2>
          <p className="truncate text-[11px] leading-tight text-muted-foreground">
            {isReady ? "AI 選課助手" : "Connecting…"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            aria-label="New chat"
            title="New chat"
            onClick={onNewChat}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Close"
            title="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div
          ref={viewportRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto overscroll-contain px-4 py-5 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5"
        >
          <div
            ref={contentRef}
            className={cn(
              "flex min-h-full flex-col",
              turns.length === 0 ? "" : "gap-5 pb-2",
            )}
          >
            {turns.length === 0 ? (
              <Welcome
                suggestions={suggestionList}
                onPick={onSend}
                disabled={!isReady || isRunning}
              />
            ) : (
              <>
                {turns.map((turn, index) => {
                  const isLast = index === turns.length - 1;
                  const key = turn.user?.id ?? turn.assistant[0]?.id ?? `turn-${index}`;
                  return (
                    <div key={key} className="flex flex-col gap-3">
                      {turn.user ? <UserTurn message={turn.user} /> : null}
                      {turn.assistant.length > 0 ? (
                        <AssistantTurn
                          parts={turn.assistant}
                          results={toolResults}
                          isRunning={isRunning}
                          isLast={isLast}
                          toolRenderer={toolRenderer}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {awaitingReply ? <ThinkingRow /> : null}
              </>
            )}
          </div>
        </div>
        <ConversationScrollButton visible={showScrollButton} onClick={() => scrollToBottom()} />
      </div>

      <div className="shrink-0 bg-background px-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3">
        {alert ? (
          <div
            role="alert"
            className="mb-2 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-snug text-destructive-strong"
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">{alert}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={onClearAlert}
              className="shrink-0 rounded p-0.5 transition-colors hover:bg-destructive/10"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </div>
        ) : null}
        <PromptInput
          value={draft}
          onValueChange={onDraftChange}
          onSubmit={() => onSend(draft)}
          onStop={onStop}
          isRunning={isRunning}
          disabled={!isReady}
        />
        <p className="mt-2 px-1 text-center text-[10px] leading-snug text-muted-foreground">
          Not affiliated with UM. AI responses are for reference only.
          <span className="mt-0.5 block">與澳門大學無隸屬關係，AI 回覆僅供參考。</span>
        </p>
      </div>
    </aside>
  );
}
