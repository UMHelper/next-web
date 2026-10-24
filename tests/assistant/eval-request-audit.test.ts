import { afterEach, describe, expect, it, vi } from "vitest";

import { auditRequestBody, captureRequests, type RequestAudit } from "@/evals/assistant/request-audit";
import { readAssistantConfig } from "@/lib/assistant/config";
import { createAssistantModel, thinkingProviderOptions } from "@/lib/assistant/model";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auditRequestBody", () => {
  it("keeps the settings and counts reasoning_content without copying any text", () => {
    const body = JSON.stringify({
      model: "deepseek-flash",
      stream: true,
      max_tokens: 1200,
      thinking: { type: "enabled" },
      reasoning_effort: "low",
      tools: [
        { type: "function", function: { name: "navigate" } },
        { type: "function", function: { name: "get_course" } },
      ],
      messages: [
        { role: "system", content: "SECRET PROMPT" },
        { role: "user", content: "my question" },
        { role: "assistant", content: "", reasoning_content: "PRIVATE-CHAIN", tool_calls: [] },
        { role: "assistant", content: "", reasoning_content: "" },
        { role: "assistant", content: "hi" },
      ],
    });

    const audit = auditRequestBody(body);

    expect(audit).toEqual({
      model: "deepseek-flash",
      stream: true,
      maxTokens: 1200,
      thinking: { type: "enabled" },
      reasoningEffort: "low",
      toolChoice: null,
      tools: ["get_course", "navigate"],
      messages: 5,
      assistantMessages: 3,
      reasoningReplayed: 1,
      reasoningEmpty: 1,
      reasoningAbsent: 1,
    });
    expect(JSON.stringify(audit)).not.toMatch(/SECRET PROMPT|my question|PRIVATE-CHAIN/);
  });

  it("ignores bodies that are not chat requests", () => {
    expect(auditRequestBody(undefined)).toBeNull();
    expect(auditRequestBody("not json")).toBeNull();
    expect(auditRequestBody(JSON.stringify({ hello: 1 }))).toBeNull();
  });
});

describe("captureRequests", () => {
  it("audits what the assistant model sends, then puts fetch back", async () => {
    const upstream = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", upstream);
    const audits: RequestAudit[] = [];

    const restore = captureRequests(audits);
    const model = createAssistantModel(readAssistantConfig({ AI_API_KEY: "sk-test", AI_THINKING: "low" }));
    await expect(
      model.doStream({
        prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
        maxOutputTokens: 1200,
        providerOptions: thinkingProviderOptions("low"),
      }),
    ).rejects.toThrow();
    restore();

    expect(audits).toEqual([
      expect.objectContaining({ maxTokens: 1200, thinking: { type: "enabled" }, reasoningEffort: "low" }),
    ]);
    expect(globalThis.fetch).toBe(upstream);
  });
});
