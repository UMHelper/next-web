import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { Request as NativeRequest } from "undici";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentTurnClaim } from "@/lib/assistant/rate-limit";
import { expandAssistantActivity } from "@/tests/components/expand-assistant-activity";
import { absoluteUrl, buildCoursePath, buildProfessorPath, buildReviewPath } from "@/lib/site";

/**
 * Real AssistantPanel, AssistantChat, CopilotKit provider, and /api/copilotkit route with a
 * scripted model. Proves the V2.1 search, filter, course detail, and sections flow end to end.
 */

type Step =
  | { text: string }
  | { tool: string; input: Record<string, unknown> }
  | { tools: { tool: string; input: Record<string, unknown> }[] };
type ModelCall = {
  page: unknown;
  catalog?: {
    resultSets: Array<{
      resultSetId: string;
      newest: boolean;
      filter?: string;
      shownCount?: number;
      courses?: Array<{ position: number; courseCode: string }>;
    }>;
  };
  referent?: { kind: string; courseCode?: string; reason?: string; ask?: string };
  toolNames: string[];
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

function mathSearchFixture() {
  const results = Array.from({ length: 10 }, (_, index) => {
    const num = 1001 + index;
    const courseCode = `MATH${num}`;
    return {
      courseCode,
      titleEn: `Mathematics ${num}`,
      titleZh: null as string | null,
      faculty: null as string | null,
      department: null as string | null,
      credits: null as string | null,
      isOffered: courseCode === "MATH1002" || courseCode === "MATH1005",
      url: absoluteUrl(buildCoursePath(courseCode)),
    };
  });
  return {
    type: "course" as const,
    page: 1,
    hasMore: true,
    totalCount: 127,
    results,
  };
}

const acctSearchFixture = {
  type: "course" as const,
  page: 1,
  hasMore: false,
  totalCount: 3,
  results: ["ACCT1000", "ACCT2000", "ACCT3000"].map((courseCode) => ({
    courseCode,
    titleEn: `Accounting ${courseCode}`,
    titleZh: null as string | null,
    faculty: null as string | null,
    department: null as string | null,
    credits: null as string | null,
    isOffered: true,
    url: absoluteUrl(buildCoursePath(courseCode)),
  })),
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
  input: { type: "course" | "instructor"; query?: string },
  _signal: AbortSignal,
) {
  if (input.type === "instructor") {
    return instructorCatalogFixture;
  }
  if (input.query === "ACCT") {
    return acctSearchFixture;
  }
  if (input.query === "EMPTY") {
    return {
      type: "course" as const,
      page: 1,
      hasMore: false,
      totalCount: 3,
      results: ["MATH1001", "MATH1002", "MATH1003"].map((courseCode) => ({
        courseCode,
        titleEn: courseCode,
        titleZh: null,
        faculty: null,
        department: null,
        credits: null,
        isOffered: false,
        url: absoluteUrl(buildCoursePath(courseCode)),
      })),
    };
  }
  return mathSearchFixture();
}

async function fixtureGetCourse(input: { code: string }, _signal: AbortSignal) {
  const courseCode = input.code.trim().toUpperCase();
  return {
    course: {
      courseCode,
      titleEn: `Fixture ${courseCode}`,
      titleZh: null,
      credits: "3",
      faculty: null,
      department: null,
      programLevel: null,
      suggestedYear: null,
      medium: null,
      gradingSystem: null,
      courseType: null,
      duration: null,
      description: null,
      isOffered: courseCode === "MATH1002",
      url: absoluteUrl(buildCoursePath(courseCode)),
    },
    page: 1,
    hasMore: false,
    totalCount: 1,
    instructors: [
      {
        name: "CHAN TAI MAN",
        commentCount: 2,
        result: null,
        attendance: null,
        grade: null,
        difficulty: null,
        reward: null,
        isOffered: courseCode === "MATH1002",
        reviewUrl: absoluteUrl(buildReviewPath(courseCode, "CHAN TAI MAN")),
      },
    ],
  };
}

async function fixtureGetCourseSections(
  input: { code: string; instructor: string },
  _signal: AbortSignal,
) {
  const courseCode = input.code.trim().toUpperCase();
  return {
    courseCode,
    instructor: input.instructor.trim().toUpperCase(),
    courseUrl: absoluteUrl(buildCoursePath(courseCode)),
    sections: [
      {
        section: "001",
        schedules: [
          { weekday: "MON", startTime: "09:00", endTime: "10:15", location: "E11-1001" },
          { weekday: "THU", startTime: "09:00", endTime: "10:15", location: null },
        ],
        courseUrl: absoluteUrl(buildCoursePath(courseCode)),
      },
      {
        section: "002",
        schedules: [],
        courseUrl: absoluteUrl(buildCoursePath(courseCode)),
      },
    ],
  };
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
  maybePruneAssistantTelemetry: async () => {},
}));
vi.mock("@/lib/assistant/tools", async (importOriginal) => {
  const { runReadOnlyTool } = await importOriginal<typeof import("@/lib/assistant/tools")>();
  const { defineTool } = await import("@copilotkit/runtime/v2");
  const { z } = await import("zod");
  const {
    searchCatalogInputSchema,
    searchCatalogOutputSchema,
    getCourseInputSchema,
    getCourseOutputSchema,
    getCourseSectionsInputSchema,
    getCourseSectionsOutputSchema,
  } = await import("@/lib/mcp/schemas");
  const { bindCourseToolArgs } = await import("@/lib/assistant/course-referent");
  const { createPresentationLedger } = await import("@/lib/assistant/presentation");
  const { mockPresentResponseTool } = await import("@/tests/assistant/integration-mock-present-response");
  type CourseReferent = import("@/lib/assistant/course-referent").CourseReferent;
  type PresentationSlot = import("@/lib/assistant/presentation").PresentationSlot;

  const pageParam = z.number().int().min(1).max(50).optional().describe("Page number, default 1");
  const codeParam = z.string().min(1).max(20).describe("Course code, e.g. ACCT1000");
  const instructorParam = z
    .string()
    .min(1)
    .max(80)
    .describe("Instructor name in English, e.g. CHAN TAI MAN");

  return {
    runReadOnlyTool,
    createAssistantTools: (
      slot?: { current: CourseReferent },
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
      defineTool({
        name: "get_course",
        description: "Get a course",
        parameters: z.object({ code: codeParam, page: pageParam }),
        execute: async (args) => {
          const bound = bindCourseToolArgs(slot?.current ?? { kind: "none" }, "get_course", args);
          if (bound.action === "clarify") return bound.result;
          const nextArgs = bound.args;
          return runReadOnlyTool("get_course", nextArgs, getCourseInputSchema, getCourseOutputSchema, fixtureGetCourse);
        },
      }),
      defineTool({
        name: "get_course_sections",
        description: "Get course sections",
        parameters: z.object({ code: codeParam, instructor: instructorParam }),
        execute: async (args) => {
          const bound = bindCourseToolArgs(slot?.current ?? { kind: "none" }, "get_course_sections", args);
          if (bound.action === "clarify") return bound.result;
          const nextArgs = bound.args;
          return runReadOnlyTool(
            "get_course_sections",
            nextArgs,
            getCourseSectionsInputSchema,
            getCourseSectionsOutputSchema,
            fixtureGetCourseSections,
          );
        },
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
import { CATALOG_RESULTS_CONTEXT_DESCRIPTION } from "@/lib/assistant/catalog-result-sets";
import { COURSE_REFERENT_DESCRIPTION } from "@/lib/assistant/course-referent";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";

const runs = () => h.runs as RunRecord[];

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

let toolCallCount = 0;
let searchCallCount = 0;
let inflightRunPosts = 0;
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
  if ("tools" in step) {
    const chunks: LanguageModelV3StreamPart[] = [{ type: "stream-start", warnings: [] }];
    for (const entry of step.tools) {
      toolCallCount++;
      const toolCallId =
        entry.tool === "search_catalog" ? `call-${++searchCallCount}` : `tool-${toolCallCount}`;
      chunks.push({
        type: "tool-call",
        toolCallId,
        toolName: entry.tool,
        input: JSON.stringify(entry.input),
      });
    }
    chunks.push({ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage });
    return chunks;
  }
  toolCallCount++;
  const toolCallId = step.tool === "search_catalog" ? `call-${++searchCallCount}` : `tool-${toolCallCount}`;
  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-call", toolCallId, toolName: step.tool, input: JSON.stringify(step.input) },
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

function toolNamesFrom(prompt: LanguageModelV3Prompt): string[] {
  const names: string[] = [];
  for (const message of prompt) {
    if (message.role !== "assistant") {
      continue;
    }
    const content = message.content;
    if (!Array.isArray(content)) {
      continue;
    }
    for (const part of content) {
      if (part.type === "tool-call") {
        names.push(part.toolName);
      }
    }
  }
  return names;
}

function describeCall(prompt: LanguageModelV3Prompt): ModelCall {
  const system = prompt.flatMap((message) => (message.role === "system" ? [message.content] : [])).join("\n");
  const marker = `${PAGE_CONTEXT_DESCRIPTION}:\n`;
  const at = system.indexOf(marker);
  const page = at < 0 ? undefined : JSON.parse(system.slice(at + marker.length).split("\n")[0]);

  let catalog: ModelCall["catalog"];
  const catalogMarker = `${CATALOG_RESULTS_CONTEXT_DESCRIPTION}:\n`;
  const catalogAt = system.indexOf(catalogMarker);
  if (catalogAt >= 0) {
    const valueLine = system.slice(catalogAt + catalogMarker.length).split("\n")[0];
    if (valueLine.startsWith("{")) {
      catalog = JSON.parse(valueLine);
    }
  }

  let referent: ModelCall["referent"];
  const referentMarker = `${COURSE_REFERENT_DESCRIPTION}:\n`;
  const referentAt = system.indexOf(referentMarker);
  if (referentAt >= 0) {
    const valueLine = system.slice(referentAt + referentMarker.length).split("\n")[0];
    if (valueLine.startsWith("{")) {
      referent = JSON.parse(valueLine);
    }
  }

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
    catalog,
    referent,
    toolNames: toolNamesFrom(prompt),
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
  const webRequest = request as unknown as Request;
  if (request.method === "POST" && url.pathname.endsWith("/run")) {
    h.runs.push({
      body: (await request.clone().json()) as RunRecord["body"],
      modelCalls: [],
    } satisfies RunRecord);
    inflightRunPosts++;
    try {
      return await route.POST(webRequest);
    } finally {
      inflightRunPosts--;
    }
  }
  return request.method === "GET" ? route.GET(webRequest) : route.POST(webRequest);
}

function v21Brain(call: ModelCall): Step {
  if (call.lastTool?.name === "search_catalog") {
    return browsePresentAfterSearch(searchCallCount);
  }
  if (call.lastTool?.name === "present_response") {
    return { text: "Here are MATH courses." };
  }
  if (call.lastTool?.name === "filter_catalog_results") {
    return { text: /stale filter/i.test(call.lastUser) ? "Stale filter noted." : "Filtered to offered courses." };
  }
  if (call.lastTool?.name === "get_course") {
    if (/When is MATH1002 taught/i.test(call.lastUser)) {
      return { tool: "get_course_sections", input: { code: "MATH1002", instructor: "CHAN TAI MAN" } };
    }
    return { text: "Here are the course details." };
  }
  if (call.lastTool?.name === "get_course_sections") {
    return { text: "Here are the class sections." };
  }

  if (/Search for MATH/i.test(call.lastUser)) {
    return { tool: "search_catalog", input: { type: "course", query: "MATH" } };
  }
  if (/Search for ACCT/i.test(call.lastUser)) {
    return { tool: "search_catalog", input: { type: "course", query: "ACCT" } };
  }
  if (/only those offered/i.test(call.lastUser)) {
    return {
      tool: "filter_catalog_results",
      input: {
        resultSetId: call.catalog?.resultSets.find((set) => set.newest)?.resultSetId ?? "call-1",
        filter: "offered",
      },
    };
  }
  if (/Tell me more about MATH1002/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "MATH1002" } },
        {
          tool: "present_response",
          input: { show: [{ component: "course_detail", course: "MATH1002" }] },
        },
      ],
    };
  }
  if (/When is MATH1002 taught/i.test(call.lastUser)) {
    return { tool: "get_course", input: { code: "MATH1002" } };
  }
  if (/stale filter/i.test(call.lastUser)) {
    return { tool: "filter_catalog_results", input: { resultSetId: "call-1", filter: "offered" } };
  }

  return { text: "ok" };
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

async function waitForCatalogResultsBlock(resultSetId = "call-1") {
  return waitFor(
    () => {
      const el = document.getElementById(`catalog-results-${resultSetId}`);
      expect(el).not.toBeNull();
      return el!;
    },
    { timeout: 10000 },
  );
}

function agentBusy() {
  return (
    inflightRunPosts > 0 ||
    screen.queryByText("Thinking…") ||
    screen.queryByText("Filtering results…") ||
    screen.queryByText("Searching the catalog…") ||
    screen.queryByText("Loading course details…") ||
    screen.queryByText("Loading class sections…")
  );
}

async function waitForAgentIdle() {
  let lastSignature = "";
  let stableChecks = 0;
  await waitFor(
    async () => {
      if (agentBusy()) {
        lastSignature = "";
        stableChecks = 0;
        expect(false).toBe(true);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (agentBusy() || inflightRunPosts > 0) {
        lastSignature = "";
        stableChecks = 0;
        expect(false).toBe(true);
      }
      const signature = `${runs().length}:${runs().flatMap((run) => run.modelCalls).length}`;
      if (signature === lastSignature) {
        stableChecks++;
      } else {
        lastSignature = signature;
        stableChecks = 0;
      }
      expect(stableChecks).toBeGreaterThanOrEqual(2);
    },
    { timeout: 10000 },
  );
}

async function typeAndSend(text: string) {
  const beforeRuns = runs().length;
  fireEvent.change(screen.getByLabelText("Ask about courses"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await waitFor(() => expect(runs().length).toBeGreaterThan(beforeRuns), { timeout: 10000 });
  await waitForAgentIdle();
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
  h.brain = v21Brain as never;
  nav.landOnPush = true;
  nav.pushes = [];
  toolCallCount = 0;
  searchCallCount = 0;
  inflightRunPosts = 0;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("assistant V2.1 integration (scripted model)", () => {
  it("searches, filters locally, filters by follow-up, shows details and sections, and resets on new chat", async () => {
    await mountAssistant();
    await typeAndSend("Search for MATH courses");
    let block = await waitForCatalogResultsBlock();
    expect(within(block).getAllByRole("listitem")).toHaveLength(10);

    const runsBefore = runs().length;
    const calls = runs().flatMap((r) => r.modelCalls).length;
    fireEvent.click(within(block).getByRole("button", { name: "Offered only" }));
    expect(within(block).getAllByRole("listitem")).toHaveLength(2);
    expect(runs().length).toBe(runsBefore);
    expect(runs().flatMap((r) => r.modelCalls).length).toBe(calls);
    fireEvent.click(within(block).getByRole("button", { name: "All loaded" }));
    expect(within(block).getAllByRole("listitem")).toHaveLength(10);

    await typeAndSend("Show me only those offered this semester");
    await waitFor(() => expect(screen.getByText("Filtered to offered courses.")).toBeTruthy(), { timeout: 10000 });
    block = await waitForCatalogResultsBlock();
    const firstCall = runs().at(-1)!.modelCalls[0];
    expect(firstCall.catalog?.resultSets[0]).toMatchObject({ resultSetId: "call-1", newest: true });
    expect(runs().at(-1)!.modelCalls.some((c) => c.lastTool?.name === "search_catalog")).toBe(false);
    const filterOut = JSON.parse(
      runs().at(-1)!.modelCalls.find((c) => c.lastTool?.name === "filter_catalog_results")!.lastTool!.output,
    );
    expect(filterOut).toMatchObject({
      status: "applied",
      shownCourseCodes: ["MATH1002", "MATH1005"],
      scope: "loaded_results_only",
      totalCount: 127,
    });
    expect(within(block).getAllByRole("listitem")).toHaveLength(2);
    expect(within(block).getByRole("button", { name: "Offered only" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Show results" })).toBeTruthy();
    expandAssistantActivity();
    expect(screen.getAllByText("Filtered results")).toHaveLength(1);
    expect(screen.queryByText("Filtering results…")).toBeNull();

    await typeAndSend("Tell me more about MATH1002");
    await waitFor(() => expect(screen.getByRole("article", { name: "MATH1002" })).toBeTruthy(), { timeout: 10000 });

    await typeAndSend("When is MATH1002 taught?");
    await waitFor(() => expect(screen.getByText("Here are the class sections.")).toBeTruthy(), { timeout: 10000 });
    expect(screen.queryByRole("article", { name: "Section 001" })).toBeNull();
    expandAssistantActivity();
    expect(screen.getAllByText("Read class times")).toHaveLength(1);
    expect(screen.getByText("Here are the class sections.")).toBeTruthy();

    await act(async () => {
      nav.set("/course/MATH1002");
    });
    await waitFor(() => expect(nav.get()).toBe("/course/MATH1002"));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.click(screen.getByRole("button", { name: "AI Course Helper" }));
    const reopened = await waitFor(
      () => {
        const el = document.getElementById("catalog-results-call-1");
        expect(el).not.toBeNull();
        return el!;
      },
      { timeout: 10000 },
    );
    expect(within(reopened).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("article", { name: "Section 001" })).toBeNull();
    expect(screen.queryByText("Searching courses…")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    await waitFor(() => expect(document.getElementById("catalog-results-call-1")).toBeNull());
    expect(screen.queryByText("Searched courses")).toBeNull();
    expect(screen.queryByText("Filtered results")).toBeNull();
    expect(screen.queryByText("Read class times")).toBeNull();
    await typeAndSend("stale filter");
    await waitFor(
      () =>
        expect(
          screen.getByText("Those earlier results are no longer available. Search again to filter them."),
        ).toBeTruthy(),
      { timeout: 10000 },
    );
    expandAssistantActivity();
    expect(screen.getByText("Lookup failed")).toBeTruthy();
    expect(screen.queryByText("Filtered results")).toBeNull();
    expect(runs().at(-1)!.modelCalls[0].catalog).toBeUndefined();
  }, 120_000);

  it("uses the newest of several result sets", async () => {
    await mountAssistant();
    await typeAndSend("Search for MATH courses");
    const mathBlock = await waitFor(
      () => {
        const el = document.getElementById("catalog-results-call-1");
        expect(el).not.toBeNull();
        return el!;
      },
      { timeout: 10000 },
    );
    expect(within(mathBlock).getAllByRole("listitem")).toHaveLength(10);

    await typeAndSend("Search for ACCT courses");
    await waitFor(() => expect(document.getElementById("catalog-results-call-2")).not.toBeNull(), { timeout: 10000 });

    await typeAndSend("Show me only those offered this semester");
    await waitFor(() => expect(screen.getByText("Filtered to offered courses.")).toBeTruthy(), { timeout: 10000 });
    const filterOut = JSON.parse(
      runs().at(-1)!.modelCalls.find((c) => c.lastTool?.name === "filter_catalog_results")!.lastTool!.output,
    );
    expect(filterOut.resultSetId).toBe("call-2");
    expect(within(mathBlock).getAllByRole("listitem")).toHaveLength(10);
  }, 60_000);

  function stubbornOrdinalBrain(call: ModelCall): Step {
    if (call.lastTool?.name === "get_course") {
      return { text: "ok" };
    }
    if (call.lastTool?.name === "search_catalog") {
      return browsePresentAfterSearch(searchCallCount);
    }
    if (call.lastTool?.name === "present_response") {
      return { text: "Here are MATH courses." };
    }
    if (call.lastTool?.name === "filter_catalog_results") {
      return { text: "Filtered to offered courses." };
    }
    if (/Search for MATH/i.test(call.lastUser)) {
      return { tool: "search_catalog", input: { type: "course", query: "MATH" } };
    }
    if (/Search for ACCT/i.test(call.lastUser)) {
      return { tool: "search_catalog", input: { type: "course", query: "ACCT" } };
    }
    if (/Search for EMPTY/i.test(call.lastUser)) {
      return { tool: "search_catalog", input: { type: "course", query: "EMPTY" } };
    }
    if (/only those offered/i.test(call.lastUser)) {
      return {
        tool: "filter_catalog_results",
        input: {
          resultSetId: call.catalog?.resultSets.find((set) => set.newest)?.resultSetId ?? "call-1",
          filter: "offered",
        },
      };
    }
    if (/second course/i.test(call.lastUser)) {
      return { tool: "get_course", input: { code: "MATH1002" } };
    }
    return { text: "ok" };
  }

  it("resolves the second visible course after manual and agent filters", async () => {
    h.brain = stubbornOrdinalBrain as never;
    await mountAssistant();
    await typeAndSend("Search for MATH courses");
    let block = await waitForCatalogResultsBlock();

    const runsBefore = runs().length;
    fireEvent.click(within(block).getByRole("button", { name: "Offered only" }));
    expect(runs().length).toBe(runsBefore);
    expect(within(block).getAllByRole("listitem")).toHaveLength(2);
    const offeredRows = within(block).getAllByRole("listitem");
    expect(offeredRows[0].textContent).toContain("MATH1002");
    expect(offeredRows[0].textContent).toContain("1.");
    expect(offeredRows[1].textContent).toContain("MATH1005");
    expect(offeredRows[1].textContent).toContain("2.");
    expect(within(block).getByText("2 offered among 10 loaded · 127 total matches")).toBeTruthy();

    await typeAndSend("Tell me about the second course in those results");
    const offeredCall = runs().at(-1)!.modelCalls[0];
    expect(offeredCall.catalog?.resultSets[0]).toMatchObject({
      filter: "offered",
      shownCount: 2,
      courses: [
        { position: 1, courseCode: "MATH1002" },
        { position: 2, courseCode: "MATH1005" },
      ],
    });
    expect(offeredCall.referent).toMatchObject({ kind: "ordinal", courseCode: "MATH1005", position: 2 });
    const offeredCourse = runs()
      .at(-1)!
      .modelCalls.find((call) => call.lastTool?.name === "get_course")!.lastTool!.output;
    expect(offeredCourse).toContain("MATH1005");
    expect(offeredCourse).not.toContain("MATH1002");

    block = await waitForCatalogResultsBlock();
    const runsBeforeAll = runs().length;
    fireEvent.click(within(block).getByRole("button", { name: "All loaded" }));
    expect(runs().length).toBe(runsBeforeAll);
    await typeAndSend("Tell me about the second course in those results");
    expect(runs().at(-1)!.modelCalls[0].catalog?.resultSets[0].courses?.[1]).toMatchObject({
      position: 2,
      courseCode: "MATH1002",
    });
    expect(runs().at(-1)!.modelCalls.find((call) => call.lastTool?.name === "get_course")!.lastTool!.output).toContain(
      "MATH1002",
    );

    await typeAndSend("Search for ACCT courses");
    await typeAndSend("Tell me about the second course in those results");
    expect(runs().at(-1)!.modelCalls[0].referent).toMatchObject({
      kind: "ordinal",
      courseCode: "ACCT2000",
      resultSetId: "call-2",
    });
    expect(runs().at(-1)!.modelCalls.find((call) => call.lastTool?.name === "get_course")!.lastTool!.output).toContain(
      "ACCT2000",
    );
  }, 90_000);

  it("does not invent a course when Offered only hides every loaded row", async () => {
    h.brain = stubbornOrdinalBrain as never;
    await mountAssistant();
    await typeAndSend("Search for EMPTY courses");
    const block = await waitFor(() => {
      const el = document.getElementById("catalog-results-call-1");
      expect(el).not.toBeNull();
      return el!;
    });
    fireEvent.click(within(block).getByRole("button", { name: "Offered only" }));
    await typeAndSend("Tell me about the second course in those results");
    expect(runs().at(-1)!.modelCalls[0].referent).toMatchObject({ kind: "ambiguous", reason: "missing_ordinal" });
    expect(runs().at(-1)!.modelCalls.find((call) => call.lastTool?.name === "get_course")!.lastTool!.output).toContain(
      "needs_clarification",
    );
    expect(screen.queryByRole("article", { name: "MATH1002" })).toBeNull();
  }, 60_000);

  it("resolves the second visible course after the agent applies Offered only", async () => {
    h.brain = stubbornOrdinalBrain as never;
    await mountAssistant();
    await typeAndSend("Search for MATH courses");
    await typeAndSend("Show me only those offered this semester");
    await waitFor(() => expect(screen.getByText("Filtered to offered courses.")).toBeTruthy(), { timeout: 10000 });
    const runsBefore = runs().length;
    await typeAndSend("Tell me about the second course in those results");
    expect(runs().length).toBeGreaterThan(runsBefore);
    expect(runs().at(-1)!.modelCalls[0].referent).toMatchObject({
      kind: "ordinal",
      courseCode: "MATH1005",
      position: 2,
    });
    expect(runs().at(-1)!.modelCalls[0].catalog?.resultSets[0]).toMatchObject({
      filter: "offered",
      courses: [
        { position: 1, courseCode: "MATH1002" },
        { position: 2, courseCode: "MATH1005" },
      ],
    });
    expect(
      runs().at(-1)!.modelCalls.find((call) => call.lastTool?.name === "get_course")!.lastTool!.output,
    ).toContain("MATH1005");
  }, 60_000);
});
