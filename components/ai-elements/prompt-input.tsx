"use client";

import { ArrowUp, Loader2, Square } from "lucide-react";
import {
  useEffect,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import { cn } from "@/lib/utils";

/**
 * AI Elements Prompt Input, adapted to the assistant's single-field composer.
 * Auto-resizes up to 10rem and keeps Enter = send, Shift+Enter = newline.
 */
export function PromptInput({
  value,
  onValueChange,
  onSubmit,
  onStop,
  isRunning,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isRunning: boolean;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = value.trim().length > 0 && !isRunning && !disabled;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (canSend) onSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (canSend) onSubmit();
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      <div className="rounded-2xl border border-border bg-background p-3 shadow-sm transition-all focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/20">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          aria-label="Ask about courses"
          placeholder="Ask about a course or instructor…"
          className="block max-h-40 min-h-[44px] w-full resize-none bg-transparent px-1 py-1 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-1">
          <span className="hidden items-center gap-1 whitespace-nowrap text-[10px] leading-none text-muted-foreground sm:flex">
            <kbd className="rounded border border-border bg-surface-subtle px-1 py-0.5 font-sans text-[10px] font-medium leading-none text-foreground">
              Enter
            </kbd>
            <span>to send</span>
            <span aria-hidden className="px-0.5 text-border">
              ·
            </span>
            <kbd className="rounded border border-border bg-surface-subtle px-1 py-0.5 font-sans text-[10px] font-medium leading-none text-foreground">
              Shift + Enter
            </kbd>
            <span>for a new line</span>
          </span>
          <span className="flex items-center gap-1 whitespace-nowrap text-[10px] leading-none text-muted-foreground sm:hidden">
            <kbd className="rounded border border-border bg-surface-subtle px-1 py-0.5 font-sans text-[10px] font-medium leading-none text-foreground">
              Enter
            </kbd>
            <span>to send</span>
          </span>
          {isRunning ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop generating"
              className="flex h-8 items-center gap-1.5 rounded-full border border-border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Loader2 className="h-3 w-3 animate-spin text-brand" aria-hidden />
              Stop
              <Square className="h-2.5 w-2.5 fill-current" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              disabled={!canSend}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm transition-colors hover:bg-brand-strong disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    </form>
  );
}

export function PromptInputHint({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 px-1 text-[10px] leading-snug text-muted-foreground">{children}</p>;
}
