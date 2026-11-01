import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ASSISTANT_RUN_HEADER,
  getRunContext,
  registerRunContext,
  releaseRunContext,
  type RunContext,
} from "@/lib/assistant/run-context";
import { readAssistantConfig } from "@/lib/assistant/config";
import { createRunTelemetry } from "@/lib/assistant/telemetry";

const identity = {
  userHash: "u".repeat(32),
  threadHash: "t".repeat(32),
  turnKey: "k".repeat(32),
  isContinuation: false,
};

const context = (runKey: string): RunContext => ({
  config: readAssistantConfig({ AI_API_KEY: "sk-test" }),
  telemetry: createRunTelemetry({ runKey, identity, charged: true, maxSteps: 8 }),
});

describe("run context registry", () => {
  beforeEach(() => {
    for (let index = 0; index < 70; index += 1) releaseRunContext(`run-${index}`);
  });

  it("uses a server-owned header name", () => {
    expect(ASSISTANT_RUN_HEADER).toBe("x-assistant-run-key");
  });

  it("registers, reads and releases a context", () => {
    registerRunContext("run-a", context("run-a"));

    expect(getRunContext("run-a")?.telemetry.runKey).toBe("run-a");
    releaseRunContext("run-a");
    expect(getRunContext("run-a")).toBeNull();
  });

  it("expires a context after ten minutes", () => {
    const now = 1_000_000;
    registerRunContext("run-b", context("run-b"), now);

    expect(getRunContext("run-b", now + 10 * 60 * 1000 - 1)).not.toBeNull();
    expect(getRunContext("run-b", now + 10 * 60 * 1000)).toBeNull();
  });

  it("keeps the registry bounded", () => {
    for (let index = 0; index < 70; index += 1) {
      registerRunContext(`run-${index}`, context(`run-${index}`), index);
    }

    expect(getRunContext("run-0", 70)).toBeNull();
    expect(getRunContext("run-69", 70)).not.toBeNull();
  });
});
