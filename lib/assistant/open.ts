"use client";

export const OPEN_ASSISTANT_EVENT = "umeh:open-assistant";

export type OpenAssistantDetail = {
  prompt?: string;
  autoSend?: boolean;
};

/** Opens the in-site assistant from anywhere (command palette, future buttons). */
export function openAssistant(detail: OpenAssistantDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OpenAssistantDetail>(OPEN_ASSISTANT_EVENT, { detail }),
  );
}
