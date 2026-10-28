import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { Request as NativeRequest } from "undici";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentTurnClaim } from "@/lib/assistant/rate-limit";
import { absoluteUrl, buildCoursePath, buildProfessorPath } from "@/lib/site";

/**
 * Real AssistantPanel, AssistantChat, CopilotKit provider, and /api/copilotkit route with a
 * scripted model. Proves search_catalog results render as catalog cards and survive close/reopen
 * and new chat.
 */

type Step = { text: string } | { tool: string; input: Record<string, unknown> };
type ModelCall = {
  page: unknown;
  lastUser: string;
  lastTool?: { name: string; output: string };
  userMessages: string[];
  toolResults: string[];
};
type RunRecord = { body: { messages: Array<{ role: string; content?: unknown }> }; modelCalls: ModelCall[] };

const h = vi.hoisted(() => ({
  brain: (() => ({ text: "ok" })) as (call: never) => unknown,
  runs: [] as unknown[],
  rateLimitCalls: 0,
  rateLimit: {
    allowed: true,
    charged: true,
    identity: { userHash: "user_hash", threadHash: "thread_hash", turnKey: "turn_key", isContinuation: false },
  } as AgentTurnClaim,
  access: true,
  plan: undefined as unknown,
}));

const nav = vi.hoisted(() => {
  let pathname = "/";
  const listeners = new Set<() => void>();
  return {
    landOnPush: true,
    pushes: [] as string[],
    get: () => pathname,
    set(next: string) {
      pathname = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
});

const courseCatalogFixture = {
  type: "course" as const,
  page: 1,
  hasMore: false,
  totalCount: 1,
  results: [
    {
      courseCode: "ACCT1000",
      titleZh: "會計學原理",
      titleEn: "Principles of Accounting",
      faculty: null as string | null,
      department: null as string | null,
      credits: null as string | null,
      isOffered: true,
      url: absoluteUrl(buildCoursePath("ACCT1000")),
    },
  ],
};

const instructorCatalogFixture = {
  type: "instructor" as const,
  page: 1,
  hasMore: false,
  totalCount: 1,
  results: [
    {
      name: "CHAN TAI MAN",
      courseCount: 3,
      url: absoluteUrl(buildProfessorPath("CHAN TAI MAN")),
    },
  ],
};

async function fixtureSearchCatalog(
  input: { type: "course" | "instructor" },
  _signal: AbortSignal,
) {
  return input.type === "course" ? courseCatalogFixture : instructorCatalogFixture;
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mcp/data/search-catalog", () => ({
  searchCatalog: vi.fn(async () => {
    throw new Error("searchCatalog data layer should not run in this test");
  }),
}));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: vi.fn() }));
vi.mock("@/lib/mcp/data/get-instructor", () => ({ getInstructor: vi.fn() }));

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    usePathname: () => useSyncExternalStore(nav.subscribe, nav.get, nav.get),
    useRouter: () => ({
      push: (path: string) => {
        nav.pushes.push(path);
        if (nav.landOnPush) setTimeout(() => nav.set(new URL(path, "http://localhost").pathname), 0);
      },
    }),
  };
});
vi.mock("@clerk/nextjs/server", () => ({ auth: async () => ({ userId: "user_1" }) }));
vi.mock("@/lib/assistant/access", () => ({ canUseAssistant: async () => h.access }));
vi.mock("@/lib/assistant/rate-limit", () => ({
  claimAgentTurn: async () => {
    h.rateLimitCalls++;
    return h.rateLimit;
  },
}));
vi.mock("@/lib/assistant/settings", async () => {
  const { readAssistantConfig } = await import("@/lib/assistant/config");
  return { resolveAssistantConfig: async () => readAssistantConfig() };
});
vi.mock("@/lib/assistant/telemetry-store", () => ({
  finalizeRunUsage: async () => {},
  recordRejectedRun: async () => {},
}));
vi.mock("@/lib/assistant/tools", async (importOriginal) => {
  const { runReadOnlyTool } = await importOriginal<typeof import("@/lib/assistant/tools")>();
  const { defineTool } = await import("@copilotkit/runtime/v2");
  const { z } = await import("zod");
  const { searchCatalogInputSchema, searchCatalogOutputSchema } = await import("@/lib/mcp/schemas");
  const { createPresentationLedger } = await import("@/lib/assistant/presentation");
  const { mockPresentResponseTool } = await import("@/tests/assistant/integration-mock-present-response");
  type PresentationSlot = import("@/lib/assistant/presentation").PresentationSlot;

  const pageParam = z.number().int().min(1).max(50).optional().describe("Page number, default 1");

  return {
    runReadOnlyTool,
    createAssistantTools: (
      _slot?: unknown,
      _timetable?: unknown,
      presentation?: PresentationSlot,
    ) => {
      const presentationSlot = presentation ?? { current: createPresentationLedger() };
      return [
      defineTool({
        name: "search_catalog",
        description: "Search the site catalog",
        parameters: z.object({
          type: z.enum(["course", "instructor"]),
          query: z.string().max(80).optional(),
          faculty: z.string().max(40).optional(),
          department: z.string().max(80).optional(),
          page: pageParam,
        }),
        execute: (args) =>
          runReadOnlyTool(
            "search_catalog",
            args,
            searchCatalogInputSchema,
            searchCatalogOutputSchema,
            fixtureSearchCatalog,
          ),
      }),
      mockPresentResponseTool(presentationSlot),
    ];
    },
  };
});
vi.mock("@/lib/assistant/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/model")>()),
  createAssistantModel: () => scriptedModel(),
}));
vi.mock("@/lib/timetable/catalog-client", () => ({
  getCourseDetail: async () => ({ course: { courseTitle: "Fixture" }, profList: [] }),
  getInstructorCourses: async () => ({ courses: [] }),
  getSections: async () => ({ sections: [] }),
}));
vi.mock("@/components/timetable/planner-provider", async () => {
  const { plannerState } = await import("@/tests/helpers/planner-state");
  return {
    useTimetablePlanner: () => (h.plan ? plannerState(h.plan) : plannerState(undefined)),
  };
});

import { browsePresentAfterSearch } from "@/tests/assistant/integration-catalog-present";
import * as route from "@/app/api/copilotkit/[[...slug]]/route";
import AssistantPanel from "@/components/assistant/assistant-panel";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";

const runs = () => h.runs as RunRecord[];

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

let toolCallCount = 0;
function streamFor(step: Step): LanguageModelV3StreamPart[] {
  if ("text" in step) {
    return [
      { type: "stream-start", warnings: [] },
      { type: "text-start", id: "t" },
      { type: "text-delta", id: "t", delta: step.text },
      { type: "text-end", id: "t" },
      { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
    ];
  }
  toolCallCount++;
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId: `call-${toolCallCount}`, toolName: step.tool, input: JSON.stringify(step.input) },
    { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
  ];
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => (part.type === "text" ? part.text : "")).join("");
}

function outputOf(output: { type: string; value: unknown }): string {
  return typeof output.value === "string" ? output.value : JSON.stringify(output.value);
}

function describeCall(prompt: LanguageModelV3Prompt): ModelCall {
  const system = prompt.flatMap((message) => (message.role === "system" ? [message.content] : [])).join("\n");
  const marker = `${PAGE_CONTEXT_DESCRIPTION}:\n`;
  const at = system.indexOf(marker);
  const page = at < 0 ? undefined : JSON.parse(system.slice(at + marker.length).split("\n")[0]);
  const userMessages = prompt.filter((message) => message.role === "user").map((message) => textOf(message.content));
  const toolResults = prompt.flatMap((message) =>
    message.role === "tool"
      ? message.content.flatMap((part) => (part.type === "tool-result" ? [outputOf(part.output as never)] : []))
      : [],
  );
  const last = prompt.at(-1)!;
  const lastResult = last.role === "tool" ? last.content.find((part) => part.type === "tool-result") : undefined;
  return {
    page,
    lastUser: userMessages.at(-1) ?? "",
    lastTool:
      lastResult && lastResult.type === "tool-result"
        ? { name: lastResult.toolName, output: outputOf(lastResult.output as never) }
        : undefined,
    userMessages,
    toolResults,
  };
}

function scriptedModel() {
  return new MockLanguageModelV3({
    doStream: async ({ prompt }) => {
      const call = describeCall(prompt);
      runs().at(-1)!.modelCalls.push(call);
      const step = (h.brain as (call: ModelCall) => Step)(call);
      return { stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks: streamFor(step) }) };
    },
  });
}

async function routeFetch(input: RequestInfo | URL, init?: RequestInit) {
  const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost:3000");
  if (!url.pathname.startsWith("/api/copilotkit")) throw new Error(`unexpected fetch ${url}`);
  const { signal: _signal, ...rest } = init ?? {};
  const request = new NativeRequest(url, rest as never);
  if (request.method === "POST" && url.pathname.endsWith("/run")) {
    h.runs.push({
      body: (await request.clone().json()) as RunRecord["body"],
      modelCalls: [],
    } satisfies RunRecord);
  }
  const webRequest = request as unknown as Request;
  return request.method === "GET" ? route.GET(webRequest) : route.POST(webRequest);
}

function catalogBrain(call: ModelCall): Step {
  if (call.lastTool?.name === "search_catalog") {
    return browsePresentAfterSearch(toolCallCount);
  }
  if (call.lastTool?.name === "present_response") {
    return {
      text: "ACCT1000 appears in the results above. Here is a short summary of what matched.",
    };
  }
  if (/instructor|professor|CHAN/i.test(call.lastUser)) {
    return { tool: "search_catalog", input: { type: "instructor", query: "CHAN TAI MAN" } };
  }
  return { tool: "search_catalog", input: { type: "course", query: "ACCT1000" } };
}

function linkRouter() {
  return {
    push: (href: string) => {
      nav.pushes.push(href);
      if (nav.landOnPush) setTimeout(() => nav.set(new URL(href, "http://localhost").pathname), 0);
    },
    replace: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
  };
}

function mountAssistant() {
  nav.set("/");
  render(
    <RouterContext.Provider value={linkRouter() as never}>
      <AssistantPanel suppressed={false} />
    </RouterContext.Provider>,
  );
  return waitFor(() => expect(screen.getByLabelText("Ask about courses")).toBeTruthy(), { timeout: 5000 });
}

async function typeAndSend(text: string) {
  const beforeRuns = runs().length;
  fireEvent.change(screen.getByLabelText("Ask about courses"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(runs().length).toBeGreaterThan(beforeRuns), { timeout: 10000 });
}

beforeAll(() => {
  vi.stubEnv("AI_API_KEY", "sk-test");
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  vi.stubGlobal("Request", NativeRequest);
  vi.stubGlobal("fetch", routeFetch);
  h.runs = [];
  h.rateLimitCalls = 0;
  h.rateLimit = {
    allowed: true,
    charged: true,
    identity: { userHash: "user_hash", threadHash: "thread_hash", turnKey: "turn_key", isContinuation: false },
  };
  h.access = true;
  h.plan = undefined;
  h.brain = catalogBrain as never;
  nav.landOnPush = true;
  nav.pushes = [];
  toolCallCount = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("assistant search_catalog integration (scripted model)", () => {
  it("renders catalog cards through the real chat UI, navigation, close/reopen, and new chat", async () => {
    await mountAssistant();

    await typeAndSend("Find course ACCT1000");
    await waitFor(
      () => {
        expect(screen.getByRole("list", { name: "Loaded courses" })).toBeTruthy();
        expect(screen.getByRole("link", { name: /ACCT1000/ })).toBeTruthy();
        expect(screen.getByText("會計學原理")).toBeTruthy();
      },
      { timeout: 10000 },
    );
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /ACCT1000/ })).toBeTruthy();

    const runsBeforeNav = runs().length;
    fireEvent.click(screen.getByRole("link", { name: /ACCT1000/ }));
    expect(nav.pushes).toEqual(["/course/ACCT1000"]);
    expect(runs().length).toBe(runsBeforeNav);

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByText("ACCT1000")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "AI Course Helper" }));
    await waitFor(() => expect(screen.getByRole("link", { name: /ACCT1000/ })).toBeTruthy(), {
      timeout: 10000,
    });

    await typeAndSend("Who teaches accounting? Find instructor CHAN TAI MAN");
    await waitFor(() => expect(screen.getByRole("link", { name: "CHAN TAI MAN" })).toBeTruthy(), {
      timeout: 10000,
    });
    expect(screen.getAllByRole("link", { name: /ACCT1000/ }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "CHAN TAI MAN" }).getAttribute("href")).toBe(
      buildProfessorPath("CHAN TAI MAN"),
    );

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    await waitFor(() => {
      expect(screen.queryByRole("list", { name: "Loaded courses" })).toBeNull();
      expect(screen.queryByText("ACCT1000")).toBeNull();
      expect(screen.queryByRole("link", { name: "CHAN TAI MAN" })).toBeNull();
      expect(screen.getByText("What can I help with?")).toBeTruthy();
    });
  }, 60_000);

  it("shows no prior conversation after remounting the panel", async () => {
    await mountAssistant();
    await typeAndSend("Find course ACCT1000");
    await waitFor(() => expect(screen.getByRole("link", { name: /ACCT1000/ })).toBeTruthy(), { timeout: 10000 });

    cleanup();
    await mountAssistant();

    expect(screen.queryByRole("link", { name: /ACCT1000/ })).toBeNull();
    expect(screen.getByText("What can I help with?")).toBeTruthy();
  });
});
