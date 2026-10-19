import { Cat } from "lucide-react";

export function AssistantBubble({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="AI 選課助手"
      onClick={onClick}
      className="fixed bottom-6 right-6 z-40 flex items-center gap-2"
    >
      <span className="relative hidden rounded-2xl border border-border bg-card px-3 py-2 text-left text-xs font-medium leading-snug text-foreground shadow-md md:block">
        可以試試 AI 選課
        <span className="mt-0.5 block font-normal text-muted-foreground">Try the AI course helper</span>
        <span
          aria-hidden
          className="absolute -right-1 top-1/2 size-2.5 -translate-y-1/2 rotate-45 border-r border-t border-border bg-card"
        />
      </span>
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-lg">
        <Cat size={28} strokeWidth={2} aria-hidden />
      </span>
    </button>
  );
}
