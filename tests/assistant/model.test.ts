import { describe, expect, it, vi } from "vitest";

import { readAssistantConfig } from "@/lib/assistant/config";
import { createAssistantModel, thinkingProviderOptions, withTimeout } from "@/lib/assistant/model";

const URL_ = "https://api.deepseek.com/chat/completions";

const hangingFetch = vi.fn(
  (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    }),
);

describe("thinkingProviderOptions", () => {
  it("disables thinking for off", () => {
    expect(thinkingProviderOptions("off")).toEqual({ deepseek: { thinking: { type: "disabled" } } });
  });

  it("uses low reasoning effort for low", () => {
    expect(thinkingProviderOptions("low")).toEqual({
      deepseek: { thinking: { type: "enabled" }, reasoningEffort: "low" },
    });
  });
});

describe("withTimeout", () => {
  it("aborts a model request that runs past the timeout", async () => {
    await expect(withTimeout(hangingFetch, 20)(URL_)).rejects.toMatchObject({ name: "TimeoutError" });
  });

  it("aborts when the client disconnects", async () => {
    const controller = new AbortController();
    const pending = withTimeout(hangingFetch, 10_000, controller.signal)(URL_);
    controller.abort(new DOMException("client went away", "AbortError"));
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("passes through a response that arrives in time", async () => {
    const ok = vi.fn(async () => new Response("ok"));
    const response = await withTimeout(ok, 1000)(URL_);
    await expect(response.text()).resolves.toBe("ok");
  });
});

describe("createAssistantModel", () => {
  it("refuses to build without an API key", () => {
    expect(() => createAssistantModel(readAssistantConfig({}))).toThrow("AI_API_KEY");
  });

  it("builds the configured DeepSeek model", () => {
    expect(createAssistantModel(readAssistantConfig({ AI_API_KEY: "sk-test" })).modelId).toBe("deepseek-flash");
  });
});
