export const ASSISTANT_ACCESS_MODES = ["off", "testers", "everyone"] as const;

export type AssistantAccess = (typeof ASSISTANT_ACCESS_MODES)[number];

export const MAX_ASSISTANT_TESTERS = 200;

export function parseAssistantAccess(value: unknown): AssistantAccess {
  return ASSISTANT_ACCESS_MODES.find((mode) => mode === value) ?? "off";
}
