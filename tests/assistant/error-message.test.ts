import { describe, expect, it } from "vitest";

import { describeAssistantError } from "@/lib/assistant/error-message";

describe("describeAssistantError", () => {
  it.each([
    ["HTTP 429: Too Many Requests", "提问次数已达上限，请稍后再试。"],
    ['{"error":{"code":"rate_limited"}}', "提问次数已达上限，请稍后再试。"],
    ["HTTP 409", "本次对话已达上限，请刷新页面开始新会话。"],
    ["conversation_limit", "本次对话已达上限，请刷新页面开始新会话。"],
    ["HTTP 401", "请先登录试点账号后再使用助手。"],
    ["HTTP 403", "请先登录试点账号后再使用助手。"],
    ["Failed to fetch", "助手暂时不可用，页面其它功能不受影响。"],
  ])("%s", (message, expected) => {
    expect(describeAssistantError(message)).toBe(expected);
  });
});
