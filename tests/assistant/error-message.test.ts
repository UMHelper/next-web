import { describe, expect, it } from "vitest";

import { describeAssistantError } from "@/lib/assistant/error-message";

describe("describeAssistantError", () => {
  it.each([
    ["HTTP 429: Too Many Requests", "提問次數已達上限，請稍後再試。"],
    ['{"error":{"code":"rate_limited"}}', "提問次數已達上限，請稍後再試。"],
    ["HTTP 409", "本次對話已達上限，請刷新頁面開始新會話。"],
    ["conversation_limit", "本次對話已達上限，請刷新頁面開始新會話。"],
    ["HTTP 401", "請先登入試點帳號後再使用助手。"],
    ["HTTP 403", "請先登入試點帳號後再使用助手。"],
    ["Failed to fetch", "助手暫時不可用，頁面其它功能不受影響。"],
  ])("%s", (message, expected) => {
    expect(describeAssistantError(message)).toBe(expected);
  });
});
