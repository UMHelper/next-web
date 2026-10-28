import { describe, expect, it } from "vitest";

import { describeAssistantError } from "@/lib/assistant/error-message";

describe("describeAssistantError", () => {
  it.each([
    ["HTTP 429: Too Many Requests", "Too many requests. Please try again later."],
    ['{"error":{"code":"rate_limited"}}', "Too many requests. Please try again later."],
    ["quota_exhausted", "You've used your AI allowance for now. Please try again later."],
    ['{"error":{"code":"quota_exhausted"}}', "You've used your AI allowance for now. Please try again later."],
    [
      "execution_limit",
      "This request needed too many steps. Try a simpler question or start a new chat.",
    ],
    ["HTTP 409", "This conversation has reached its limit. Start a new chat to continue."],
    ["conversation_limit", "This conversation has reached its limit. Start a new chat to continue."],
    ["HTTP 413", "This message is too large for the assistant. Start a new chat or ask a shorter question."],
    ["payload_too_large", "This message is too large for the assistant. Start a new chat or ask a shorter question."],
    ["HTTP 401", "Please sign in to use the assistant."],
    ["HTTP 403", "Assistant access required."],
    ["HTTP 402: Insufficient Balance", "The AI service is temporarily unavailable. Please try again later."],
    ["APICallError: 401", "The AI service is not configured correctly. Please contact support."],
    ["APICallError: 429", "The AI service is busy. Please try again shortly."],
    ["TimeoutError: request timed out", "The AI service took too long. Please try again."],
    ["temporarily_unavailable", "The assistant is temporarily unavailable. Please try again."],
    ["Failed to fetch", "The assistant is temporarily unavailable. Please try again."],
  ])("%s", (message, expected) => {
    expect(describeAssistantError(message)).toBe(expected);
  });

  it("never echoes provider text", () => {
    const copy = describeAssistantError("HTTP 402: Insufficient Balance account sk-live-123");
    expect(copy).not.toMatch(/Insufficient Balance|sk-live|402/);
  });
});
