import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const runtimeHandler = vi.fn(async (_request: Request) => new Response("streamed", { status: 200 }));
  return {
    auth: vi.fn(),
    runtimeHandler,
    createCopilotRuntimeHandler: vi.fn(() => runtimeHandler),
    CopilotRuntime: vi.fn(),
    InMemoryAgentRunner: vi.fn(),
    createAssistantAgent: vi.fn(() => ({ agent: true })),
    canUseAssistant: vi.fn(),
    resolveAssistantConfig: vi.fn(),
    registerRunContext: vi.fn(),
    getRunContext: vi.fn(),
    releaseRunContext: vi.fn(),
    finalizeRunUsage: vi.fn(async () => undefined),
    recordRejectedRun: vi.fn(async () => undefined),
  };
});

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@copilotkit/runtime/v2", () => ({
  CopilotRuntime: mocks.CopilotRuntime,
  createCopilotRuntimeHandler: mocks.createCopilotRuntimeHandler,
  InMemoryAgentRunner: mocks.InMemoryAgentRunner,
}));
vi.mock("@/lib/assistant/agent", () => ({ createAssistantAgent: mocks.createAssistantAgent }));
vi.mock("@/lib/assistant/access", () => ({ canUseAssistant: mocks.canUseAssistant }));
vi.mock("@/lib/assistant/settings", () => ({
  resolveAssistantConfig: mocks.resolveAssistantConfig,
}));
vi.mock("@/lib/assistant/run-context", () => ({
  ASSISTANT_RUN_HEADER: "x-assistant-run-key",
  registerRunContext: mocks.registerRunContext,
  getRunContext: mocks.getRunContext,
  releaseRunContext: mocks.releaseRunContext,
}));
vi.mock("@/lib/assistant/telemetry-store", () => ({
  finalizeRunUsage: mocks.finalizeRunUsage,
  recordRejectedRun: mocks.recordRejectedRun,
  maybePruneAssistantTelemetry: async () => {},
}));
vi.mock("@/lib/supabase/server", () => ({ default: { rpc: vi.fn() } }));

import { readAssistantConfig, type AssistantConfig } from "@/lib/assistant/config";
import { MAX_PROVIDER_RUNS_PER_CHARGE } from "@/lib/assistant/rate-limit";

const loadRoute = () => import("@/app/api/copilotkit/[[...slug]]/route");

const post = (path: string, body: unknown) =>
  new Request(`http://localhost/api/copilotkit${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const runBody = (messages: unknown[], threadId = "t1", runId = "r1") => ({
  threadId,
  runId,
  messages,
  tools: [],
  context: [],
  state: {},
  forwardedProps: {},
});

const BASE_CONFIG: AssistantConfig = {
  ...readAssistantConfig(),
  apiKey: "sk-test",
  ratePerHour: 1,
  ratePerDay: 10,
};

async function runPost(POST: (request: Request) => Promise<Response>, body: unknown) {
  const response = await POST(post("/agent/default/run", body));
  await response.text();
  return response;
}

describe("/api/copilotkit quota lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("PREVIEW_DB_READONLY", "1");
    mocks.canUseAssistant.mockResolvedValue(true);
    mocks.resolveAssistantConfig.mockResolvedValue(BASE_CONFIG);
    mocks.runtimeHandler.mockImplementation(
      async () => new Response("streamed", { status: 200 }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("denies a second provider run when the same id carries different content", async () => {
    mocks.auth.mockResolvedValue({ userId: "quota-user-diff-content" });
    const { POST } = await loadRoute();
    const sharedId = "msg-shared";

    const first = await runPost(
      POST,
      runBody([{ id: sharedId, role: "user", content: "a" }], "thread-a", "run-a"),
    );
    const second = await runPost(
      POST,
      runBody([{ id: sharedId, role: "user", content: "b" }], "thread-a", "run-b"),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(mocks.runtimeHandler).toHaveBeenCalledTimes(1);
  });

  it(`allows up to ${MAX_PROVIDER_RUNS_PER_CHARGE} identical runs per charge then denies`, async () => {
    mocks.auth.mockResolvedValue({ userId: "quota-user-identical-cap" });
    const { POST } = await loadRoute();
    const message = { id: "msg-same", role: "user", content: "repeat me" };

    for (let index = 0; index < MAX_PROVIDER_RUNS_PER_CHARGE; index += 1) {
      const response = await runPost(
        POST,
        runBody([message], "thread-cap", `run-${index}`),
      );
      expect(response.status).toBe(200);
    }

    const denied = await runPost(POST, runBody([message], "thread-cap", "run-denied"));
    expect(denied.status).toBe(429);
    expect(mocks.runtimeHandler).toHaveBeenCalledTimes(MAX_PROVIDER_RUNS_PER_CHARGE);
  });

  it("reuses one charge for a frontend-tool continuation", async () => {
    mocks.auth.mockResolvedValue({ userId: "quota-user-continuation" });
    const { POST } = await loadRoute();
    const userMsg = { id: "u1", role: "user", content: "go" };
    const continuation = [
      userMsg,
      {
        id: "a1",
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", type: "function", function: { name: "navigate", arguments: "{}" } }],
      },
      { id: "t1", role: "tool", toolCallId: "c1", content: '{"status":"navigated"}' },
    ];

    await runPost(POST, runBody([userMsg], "thread-cont", "run-1"));
    await runPost(POST, runBody(continuation, "thread-cont", "run-2"));

    expect(mocks.runtimeHandler).toHaveBeenCalledTimes(2);
  });

  it("does not double-charge a new user message in the same thread", async () => {
    mocks.auth.mockResolvedValue({ userId: "quota-user-second-turn" });
    mocks.resolveAssistantConfig.mockResolvedValue({ ...BASE_CONFIG, ratePerHour: 2, ratePerDay: 10 });
    const { POST } = await loadRoute();

    await runPost(
      POST,
      runBody([{ id: "u1", role: "user", content: "first" }], "thread-turns", "run-1"),
    );
    await runPost(
      POST,
      runBody(
        [
          { id: "u1", role: "user", content: "first" },
          { id: "a1", role: "assistant", content: "done" },
          { id: "u2", role: "user", content: "second" },
        ],
        "thread-turns",
        "run-2",
      ),
    );

    expect(mocks.runtimeHandler).toHaveBeenCalledTimes(2);
  });

  it("isolates quota between users and threads", async () => {
    mocks.resolveAssistantConfig.mockResolvedValue({ ...BASE_CONFIG, ratePerHour: 3, ratePerDay: 10 });
    mocks.auth.mockResolvedValueOnce({ userId: "quota-user-a" });
    const { POST } = await loadRoute();
    const message = { id: "u1", role: "user", content: "hello" };

    await runPost(POST, runBody([message], "thread-1", "run-a1"));
    mocks.auth.mockResolvedValueOnce({ userId: "quota-user-b" });
    const otherUser = await runPost(POST, runBody([message], "thread-1", "run-b1"));
    mocks.auth.mockResolvedValueOnce({ userId: "quota-user-a" });
    const otherThread = await runPost(POST, runBody([message], "thread-2", "run-a2"));

    expect(otherUser.status).toBe(200);
    expect(otherThread.status).toBe(200);
    expect(mocks.runtimeHandler).toHaveBeenCalledTimes(3);
  });
});
