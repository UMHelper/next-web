import { describe, expect, it } from "vitest";

import { readAssistantConfig } from "@/lib/assistant/config";

describe("readAssistantConfig", () => {
  it("uses the spec defaults", () => {
    expect(readAssistantConfig({})).toEqual({
      apiKey: undefined,
      baseURL: "https://api.deepseek.com",
      model: "deepseek-flash",
      thinking: "off",
      maxOutputTokens: 2_000,
      timeoutMs: 30_000,
      ratePerHour: 30,
      ratePerDay: 80,
      maxTurns: 30,
      historyTurns: 8,
      maxSteps: 8,
    });
  });

  it("reads overrides", () => {
    const config = readAssistantConfig({
      AI_API_KEY: "sk-test",
      AI_BASE_URL: "https://example.test",
      AI_MODEL: "deepseek-pro",
      AI_THINKING: "low",
      AI_MAX_OUTPUT_TOKENS: "300",
      AI_TIMEOUT_MS: "5000",
      AGENT_RATE_LIMIT_PER_HOUR: "10",
      AGENT_RATE_LIMIT_PER_DAY: "20",
      AGENT_MAX_TURNS_PER_CONVERSATION: "12",
      AGENT_HISTORY_TURNS: "4",
      AGENT_MAX_STEPS: "6",
    });
    expect(config).toEqual({
      apiKey: "sk-test",
      baseURL: "https://example.test",
      model: "deepseek-pro",
      thinking: "low",
      maxOutputTokens: 300,
      timeoutMs: 5000,
      ratePerHour: 10,
      ratePerDay: 20,
      maxTurns: 12,
      historyTurns: 4,
      maxSteps: 6,
    });
  });

  it("falls back on invalid numbers and unknown thinking modes", () => {
    const config = readAssistantConfig({
      AI_THINKING: "max",
      AGENT_HISTORY_TURNS: "-1",
      AI_TIMEOUT_MS: "abc",
      AGENT_RATE_LIMIT_PER_HOUR: "1.5",
      AGENT_MAX_STEPS: "0",
    });
    expect(config.thinking).toBe("off");
    expect(config.historyTurns).toBe(8);
    expect(config.timeoutMs).toBe(30_000);
    expect(config.ratePerHour).toBe(30);
    expect(config.maxSteps).toBe(8);
  });

  it("treats an empty API key as missing", () => {
    expect(readAssistantConfig({ AI_API_KEY: "" }).apiKey).toBeUndefined();
  });
});
