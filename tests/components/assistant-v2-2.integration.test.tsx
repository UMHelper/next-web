import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { Request as NativeRequest } from "undici";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRateLimitOutcome } from "@/lib/assistant/rate-limit";
import { absoluteUrl, buildCoursePath, buildProfessorPath, buildReviewPath } from "@/lib/site";

/**
 * Real AssistantPanel, CopilotKit provider, and /api/copilotkit route with a scripted model.
 * Proves V2.2 text-first presentation, present_response opt-in, and comparison flows end to end.
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
  referent?: { kind: string; courseCode?: string; explicitCodes?: string[]; reason?: string; ask?: string };
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
  rateLimit: { allowed: true } as AgentRateLimitOutcome,
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

const compSearchFixture = {
  type: "course" as const,
  page: 1,
  hasMore: false,
  totalCount: 4,
  results: ["COMP1001", "COMP2001", "COMP3001", "COMP4001"].map((courseCode) => ({
    courseCode,
    titleEn: `Computer Science ${courseCode}`,
    titleZh: null as string | null,
    faculty: null as string | null,
    department: null as string | null,
    credits: "3",
    isOffered: true,
    url: absoluteUrl(buildCoursePath(courseCode)),
  })),
};

async function fixtureSearchCatalog(
  input: { type: "course" | "instructor"; query?: string },
  _signal: AbortSignal,
) {
  if (input.type === "instructor") {
    return {
      type: "instructor" as const,
      page: 1,
      hasMore: false,
      totalCount: 0,
      results: [],
    };
  }
  if (input.query === "COMP") {
    return compSearchFixture;
  }
  return compSearchFixture;
}

function ciscInstructors(courseCode: string) {
  if (courseCode === "CISC2001") {
    return [
      {
        name: "CHAN TAI MAN",
        commentCount: 2,
        result: null,
        attendance: null,
        grade: null,
        difficulty: 2,
        reward: null,
        isOffered: true,
        reviewUrl: absoluteUrl(buildReviewPath(courseCode, "CHAN TAI MAN")),
      },
    ];
  }
  if (courseCode === "CISC2003") {
    return [
      {
        name: "WONG SIU MING",
        commentCount: 80,
        result: null,
        attendance: null,
        grade: null,
        difficulty: 5,
        reward: null,
        isOffered: true,
        reviewUrl: absoluteUrl(buildReviewPath(courseCode, "WONG SIU MING")),
      },
    ];
  }
  return [
    {
      name: "CHAN TAI MAN",
      commentCount: 2,
      result: null,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      isOffered: true,
      reviewUrl: absoluteUrl(buildReviewPath(courseCode, "CHAN TAI MAN")),
    },
  ];
}

async function fixtureGetCourse(input: { code: string }, _signal: AbortSignal) {
  const courseCode = input.code.trim().toUpperCase();
  const description =
    courseCode === "CISC2001"
      ? "Hardware fundamentals."
      : courseCode === "CISC2003"
        ? "Programming and data structures."
        : null;
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
      description,
      isOffered: true,
      url: absoluteUrl(buildCoursePath(courseCode)),
    },
    page: 1,
    hasMore: false,
    totalCount: 1,
    instructors: ciscInstructors(courseCode),
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
    ],
  };
}

async function fixtureGetInstructor(input: { name: string }, _signal: AbortSignal) {
  const name = input.name.trim().toUpperCase();
  const courses =
    name === "WONG SIU MING"
      ? [
          {
            courseCode: "CISC2003",
            commentCount: 80,
            result: null,
            attendance: null,
            grade: null,
            difficulty: 5,
            reward: null,
            isOffered: true,
            courseUrl: absoluteUrl(buildCoursePath("CISC2003")),
            reviewUrl: absoluteUrl(buildReviewPath("CISC2003", "WONG SIU MING")),
          },
        ]
      : [
          {
            courseCode: "CISC2001",
            commentCount: 2,
            result: null,
            attendance: null,
            grade: null,
            difficulty: 2,
            reward: null,
            isOffered: true,
            courseUrl: absoluteUrl(buildCoursePath("CISC2001")),
            reviewUrl: absoluteUrl(buildReviewPath("CISC2001", "CHAN TAI MAN")),
          },
        ];
  return {
    name,
    page: 1,
    hasMore: false,
    totalCount: courses.length,
    courses,
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
  consumeAgentRateLimits: async () => {
    h.rateLimitCalls++;
    return h.rateLimit;
  },
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
    getInstructorInputSchema,
    getInstructorOutputSchema,
  } = await import("@/lib/mcp/schemas");
  const { bindCourseToolArgs } = await import("@/lib/assistant/course-referent");
  const { createPresentationLedger, executePresentResponse } = await import("@/lib/assistant/presentation");
  type CourseReferent = import("@/lib/assistant/course-referent").CourseReferent;

  const pageParam = z.number().int().min(1).max(50).optional().describe("Page number, default 1");
  const codeParam = z.string().min(1).max(20).describe("Course code, e.g. ACCT1000");
  const instructorParam = z
    .string()
    .min(1)
    .max(80)
    .describe("Instructor name in English, e.g. CHAN TAI MAN");

  return {
    runReadOnlyTool,
    createAssistantTools: (slot?: { current: CourseReferent }) => [
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
        name: "get_instructor",
        description: "Get an instructor",
        parameters: z.object({ name: instructorParam, page: pageParam }),
        execute: (args) =>
          runReadOnlyTool(
            "get_instructor",
            args,
            getInstructorInputSchema,
            getInstructorOutputSchema,
            fixtureGetInstructor,
          ),
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
      defineTool({
        name: "present_response",
        description: "Opt in to rich cards for this turn",
        parameters: z.object({
          show: z
            .array(
              z.object({
                component: z.string().max(40),
                course: z.string().max(40),
              }),
            )
            .max(6)
            .optional(),
        }),
        execute: (args) => executePresentResponse(args, createPresentationLedger()),
      }),
    ],
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

function v22Brain(call: ModelCall): Step {
  if (call.lastTool) {
    if (/Compare CISC2001 and CISC2003 slowly/i.test(call.lastUser)) {
      return { text: "CISC2001 is hardware; CISC2003 is programming." };
    }
    if (/Which professor is better for CISC2003/i.test(call.lastUser)) {
      return {
        text: "For CISC2003, WONG SIU MING has 80 reviews and CHAN TAI MAN has 2 reviews.",
      };
    }
    return { text: "Here is the interpretation." };
  }
  if (/Compare CISC2001 and CISC2003 slowly/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course", input: { code: "CISC2003" } },
      ],
    };
  }
  if (/What is CISC2001/i.test(call.lastUser) || /^CISC2001\?$/i.test(call.lastUser)) {
    return { tools: [{ tool: "get_course", input: { code: "CISC2001" } }] };
  }
  if (/Tell me more about CISC2001/i.test(call.lastUser) || /Show me the full details of CISC2001/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "present_response", input: { show: [{ component: "course_detail", course: "CISC2001" }] } },
      ],
    };
  }
  if (/CISC2001 vs CISC2003/i.test(call.lastUser) || /Compare CISC2001 and CISC2003/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2003" } },
        { tool: "get_course", input: { code: "CISC2001" } },
      ],
    };
  }
  if (/Which professor is better for CISC2003/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2003" } },
        { tool: "get_instructor", input: { name: "WONG SIU MING" } },
        { tool: "get_instructor", input: { name: "CHAN TAI MAN" } },
      ],
    };
  }
  if (/Find me some COMP electives/i.test(call.lastUser)) {
    return { tools: [{ tool: "search_catalog", input: { type: "course", query: "COMP" } }] };
  }
  if (/Show me the sections for CISC2001/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course_sections", input: { code: "CISC2001", instructor: "CHAN TAI MAN" } },
        { tool: "present_response", input: { show: [{ component: "course_sections", course: "CISC2001" }] } },
      ],
    };
  }
  if (/When is CISC2001 taught/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course_sections", input: { code: "CISC2001", instructor: "CHAN TAI MAN" } },
      ],
    };
  }
  if (/Tell me more about the second one/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC9999" } },
        { tool: "present_response", input: { show: [{ component: "course_detail", course: "CISC9999" }] } },
      ],
    };
  }
  if (/Just explain CISC2001 in one sentence/i.test(call.lastUser)) {
    return { tools: [{ tool: "get_course", input: { code: "CISC2001" } }] };
  }
  if (/Give me a table comparing CISC2001 and CISC2003/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course", input: { code: "CISC2003" } },
      ],
    };
  }
  if (/Compare this with CISC2003/i.test(call.lastUser) || /Compare this course with CISC2003/i.test(call.lastUser)) {
    return {
      tools: [
        { tool: "get_course", input: { code: "CISC2001" } },
        { tool: "get_course", input: { code: "CISC2003" } },
      ],
    };
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
  h.rateLimit = { allowed: true };
  h.access = true;
  h.plan = undefined;
  h.brain = v22Brain as never;
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

describe("assistant V2.2 integration (scripted model)", () => {
  it("keeps What is CISC2001 text-first without a card", async () => {
    await mountAssistant();
    await typeAndSend("What is CISC2001?");
    expect(screen.getAllByText("Read course").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("article", { name: "CISC2001" })).toBeNull();
    expect(screen.getByText("Here is the interpretation.")).toBeTruthy();
  }, 60_000);

  it("keeps a bare course code text-first without a card", async () => {
    await mountAssistant();
    await typeAndSend("CISC2001?");
    expect(screen.getAllByText("Read course").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByRole("article", { name: "CISC2001" })).toBeNull();
    expect(screen.getByText("Here is the interpretation.")).toBeTruthy();
  }, 60_000);

  it("mounts a course card when present_response claims course_detail for Tell me more", async () => {
    await mountAssistant();
    await typeAndSend("Tell me more about CISC2001.");
    await waitFor(() => expect(screen.getByRole("article", { name: "CISC2001" })).toBeTruthy(), { timeout: 10000 });
    expect(screen.getAllByRole("article", { name: "CISC2001" })).toHaveLength(1);
  }, 60_000);

  it("mounts a course card when present_response claims course_detail for full details", async () => {
    await mountAssistant();
    await typeAndSend("Show me the full details of CISC2001.");
    await waitFor(() => expect(screen.getByRole("article", { name: "CISC2001" })).toBeTruthy(), { timeout: 10000 });
  }, 60_000);

  it("compares courses in text without mounting comparison cards", async () => {
    await mountAssistant();
    await typeAndSend("CISC2001 vs CISC2003?");
    await waitFor(() => expect(screen.getByText("Here is the interpretation.")).toBeTruthy(), { timeout: 10000 });
    expect(screen.getAllByText("Read course").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("article", { name: "CISC2001" })).toBeNull();
    expect(screen.queryByRole("article", { name: "CISC2003" })).toBeNull();
  }, 60_000);

  it("compares instructors in prose without a comparison widget", async () => {
    await mountAssistant();
    await typeAndSend("Which professor is better for CISC2003?");
    await waitFor(
      () =>
        expect(
          screen.getByText(/For CISC2003, WONG SIU MING has 80 reviews and CHAN TAI MAN has 2 reviews\./i),
        ).toBeTruthy(),
      { timeout: 10000 },
    );
    expect(screen.getAllByText("Read instructor").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId("course-comparison")).toBeNull();
    expect(screen.queryByTestId("instructor-comparison")).toBeNull();
    expect(screen.getAllByText(/WONG SIU MING/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/CHAN TAI MAN/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/80 reviews/i)).toBeTruthy();
    expect(screen.getByText(/2 reviews/i)).toBeTruthy();
  }, 60_000);

  it("still mounts catalog search results automatically", async () => {
    await mountAssistant();
    await typeAndSend("Find me some COMP electives.");
    const block = await waitFor(
      () => {
        const el = document.getElementById("catalog-results-call-1");
        expect(el).not.toBeNull();
        return el!;
      },
      { timeout: 10000 },
    );
    expect(within(block).getAllByRole("listitem").length).toBeGreaterThan(0);
  }, 60_000);

  it("mounts section cards when present_response claims course_sections", async () => {
    await mountAssistant();
    await typeAndSend("Show me the sections for CISC2001.");
    await waitFor(() => expect(screen.getByRole("article", { name: "Section 001" })).toBeTruthy(), { timeout: 10000 });
  }, 60_000);

  it("keeps scheduling answers text-first without section cards", async () => {
    await mountAssistant();
    await typeAndSend("When is CISC2001 taught?");
    await waitFor(() => expect(screen.getByText("Read class times")).toBeTruthy(), { timeout: 10000 });
    expect(screen.queryByRole("article", { name: "Section 001" })).toBeNull();
    expect(screen.getByText("Here is the interpretation.")).toBeTruthy();
  }, 60_000);

  it("resolves discussed-course ordinals after a comparison", async () => {
    await mountAssistant();
    await typeAndSend("Compare CISC2001 and CISC2003");
    await waitFor(() => expect(screen.getByText("Here is the interpretation.")).toBeTruthy(), { timeout: 10000 });

    await typeAndSend("Tell me more about the second one");
    const followUp = runs().at(-1)!.modelCalls[0];
    expect(followUp.referent).toMatchObject({ kind: "ordinal", courseCode: "CISC2003" });
    const courseOut = runs()
      .at(-1)!
      .modelCalls.find((call) => call.lastTool?.name === "get_course")!.lastTool!.output;
    expect(courseOut).toContain("CISC2003");
    expect(courseOut).not.toContain("CISC9999");
    await waitFor(() => expect(screen.getByRole("article", { name: "CISC2003" })).toBeTruthy(), { timeout: 10000 });
  }, 90_000);

  it("treats page plus explicit code as a multiple referent", async () => {
    await mountAssistant();
    await act(async () => {
      nav.set("/course/CISC2001");
    });
    await waitFor(() => expect(nav.get()).toBe("/course/CISC2001"));
    await typeAndSend("Compare this with CISC2003.");
    await waitFor(() => expect(screen.getByText("Here is the interpretation.")).toBeTruthy(), { timeout: 10000 });
    const firstCall = runs().at(-1)!.modelCalls[0];
    expect(firstCall.page).toMatchObject({ page: "course", courseCode: "CISC2001" });
    expect(firstCall.referent?.kind).toBe("multiple");
    const courseOutputs = runs().at(-1)!.modelCalls.flatMap((call) => call.toolResults);
    expect(courseOutputs.some((out) => out.includes("CISC2001"))).toBe(true);
    expect(courseOutputs.some((out) => out.includes("CISC2003"))).toBe(true);
    expect(new Set(courseOutputs.flatMap((out) => out.match(/CISC200[13]/g) ?? [])).size).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("article", { name: "CISC2001" })).toBeNull();
    expect(screen.queryByRole("article", { name: "CISC2003" })).toBeNull();
  }, 60_000);

  it("allows a later text step after a multi-tool lookup step", async () => {
    await mountAssistant();
    await typeAndSend("Compare CISC2001 and CISC2003 slowly");
    const run = runs().at(-1)!;
    expect(run.modelCalls.length).toBe(2);
    const toolStep = run.modelCalls.find((call) => call.toolNames.filter((name) => name === "get_course").length >= 2);
    expect(toolStep).toBeTruthy();
    expect(toolStep!.toolNames).not.toContain("present_response");
    expect(screen.getByText(/CISC2001 is hardware/i)).toBeTruthy();
    expect(screen.queryByRole("article", { name: "CISC2001" })).toBeNull();
    expect(screen.queryByRole("article", { name: "CISC2003" })).toBeNull();
  }, 60_000);

  it("keeps a one-sentence explanation text-first", async () => {
    await mountAssistant();
    await typeAndSend("Just explain CISC2001 in one sentence.");
    await waitFor(() => expect(screen.getByText("Here is the interpretation.")).toBeTruthy(), { timeout: 10000 });
    expect(screen.queryByRole("article", { name: "CISC2001" })).toBeNull();
  }, 60_000);

  it("keeps an explicit table request text-first", async () => {
    await mountAssistant();
    await typeAndSend("Give me a table comparing CISC2001 and CISC2003.");
    await waitFor(() => expect(screen.getByText("Here is the interpretation.")).toBeTruthy(), { timeout: 10000 });
    expect(screen.queryByRole("article", { name: "CISC2001" })).toBeNull();
    expect(screen.queryByRole("article", { name: "CISC2003" })).toBeNull();
  }, 60_000);
});
