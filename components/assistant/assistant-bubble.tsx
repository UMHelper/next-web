import { Cat } from "lucide-react";

export function AssistantBubble({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="AI Course Helper"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2"
    >
      <span className="relative block rounded-lg border border-border bg-background px-3 py-2 text-left text-xs font-medium leading-snug text-foreground shadow-sm">
        <span className="block">AI Course Helper</span>
        <span className="mt-0.5 block font-normal text-muted-foreground">AI 選課助手</span>
        <span
          aria-hidden
          className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-r border-t border-border bg-background"
        />
      </span>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-sm">
        <Cat size={22} strokeWidth={2} aria-hidden />
      </span>
    </button>
  );
}
