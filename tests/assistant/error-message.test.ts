import { describe, expect, it } from "vitest";

import { describeAssistantError } from "@/lib/assistant/error-message";

describe("describeAssistantError", () => {
  it.each([
    ["HTTP 429: Too Many Requests", "Too many requests. Please try again later."],
    ['{"error":{"code":"rate_limited"}}', "Too many requests. Please try again later."],
    ["HTTP 409", "This conversation has reached its limit. Start a new chat to continue."],
    ["conversation_limit", "This conversation has reached its limit. Start a new chat to continue."],
    ["HTTP 413", "This message is too large for the assistant. Start a new chat or ask a shorter question."],
    ["payload_too_large", "This message is too large for the assistant. Start a new chat or ask a shorter question."],
    ["HTTP 401", "Please sign in to use the assistant."],
    ["HTTP 403", "Assistant access required."],
    ["Failed to fetch", "The assistant is temporarily unavailable. Please try again."],
  ])("%s", (message, expected) => {
    expect(describeAssistantError(message)).toBe(expected);
  });
});
