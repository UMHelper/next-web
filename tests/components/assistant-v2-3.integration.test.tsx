import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { Request as NativeRequest } from "undici";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRateLimitOutcome } from "@/lib/assistant/rate-limit";
import { CHECK_PLAN_CONFLICTS_TOOL_NAME } from "@/lib/assistant/check-plan-conflicts";
import { PREVIEW_TIMETABLE_TOOL_NAME } from "@/lib/assistant/timetable-preview";
import type { PlannerReadState } from "@/lib/assistant/timetable-context";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";
import { FIXTURE_CATALOG_SECTIONS, FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";
import { normalizePlanSection } from "@/lib/timetable/schema";

/**
 * Real AssistantPanel, CopilotKit provider, and /api/copilotkit route with a scripted model.
 * Proves V2.3 timetable digest, conflict checks, previews, and read-only behavior end to end.
 */

type Step =
  | { text: string }
  | { tool: string; input: Record<string, unknown> }
  | { tools: { tool: string; input: Record<string, unknown> }[] };

type TimetableDigest = {
  status: string;
  conflicts?: Array<{ overlap: string }>;
  days?: Record<string, { afternoon?: string; morning?: string; free?: boolean }>;
  sections?: Array<{ id: string }>;
};

type TimetablePreviewsContext = {
  previews: Array<{ kind: string; stale?: boolean; morningConflicts?: string[] }>;
};

type TimetableScenarioContext = {
  kind: string;
  previewId?: string;
  previewKind?: string;
};

type ModelCall = {
  page: unknown;
  digest?: TimetableDigest;
  previews?: TimetablePreviewsContext;
  scenario?: TimetableScenarioContext;
  toolNames: string[];
  lastUser: string;
  lastTool?: { name: string; output: string };
  userMessages: string[];
  toolResults: string[];
};

type RunRecord = { body: { messages: Array<{ role: string; content?: unknown }> }; modelCalls: ModelCall[] };

const plannerSync = vi.hoisted(() => ({
  revision: 0,
  listeners: new Set<() => void>(),
  cachedRevision: -1,
  cachedSnapshot: null as ReturnType<
    typeof import("@/tests/helpers/planner-state").plannerState
  > | null,
  bump() {
    plannerSync.revision += 1;
    for (const listener of plannerSync.listeners) listener();
  },
}));

const h = vi.hoisted(() => ({
  brain: (() => ({ text: "ok" })) as (call: never) => unknown,
  runs: [] as unknown[],
  rateLimitCalls: 0,
  rateLimit: { allowed: true } as AgentRateLimitOutcome,
  access: true,
  plan: undefined as unknown,
  plannerOverrides: undefined as Partial<PlannerReadState> | undefined,
  mutate: vi.fn(),
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
    return { type: "instructor" as const, page: 1, hasMore: false, totalCount: 0, results: [] };
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
  return {
    name: input.name.trim().toUpperCase(),
    page: 1,
    hasMore: false,
    totalCount: 0,
    courses: [],
  };
}

vi.mock("@/lib/supabase/admin", () => ({ default: {} }));
vi.mock("@/lib/supabase/server", () => ({ default: {} }));
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
  const { createTimetableTools, unavailableTimetableSlot } = await import("@/lib/assistant/timetable-tools");
  const { McpToolError } = await import("@/lib/mcp/errors");
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
  type TimetableSlot = import("@/lib/assistant/timetable-context").TimetableSlot;
  type CourseReferentSlot = import("@/lib/assistant/course-referent").CourseReferentSlot;

  const pageParam = z.number().int().min(1).max(50).optional().describe("Page number, default 1");
  const codeParam = z.string().min(1).max(20).describe("Course code, e.g. ACCT1000");
  const instructorParam = z
    .string()
    .min(1)
    .max(80)
    .describe("Instructor name in English, e.g. CHAN TAI MAN");

  const fakeDeps = {
    loadSections: async (input: { code: string; instructor: string }) => {
      const match = FIXTURE_CATALOG_SECTIONS.find(
        (entry) =>
          entry.courseCode === input.code.toUpperCase() && entry.instructor === input.instructor,
      );
      if (!match) throw new McpToolError("not_found");
      return { ...match, sectionDataComplete: true };
    },
    loadCatalogTerm: async () => ({ year: 2026, sem: 1 }),
  };

  return {
    runReadOnlyTool,
    createAssistantTools: (slot?: CourseReferentSlot, timetable?: TimetableSlot) => [
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
          return runReadOnlyTool(
            "get_course",
            bound.args,
            getCourseInputSchema,
            getCourseOutputSchema,
            fixtureGetCourse,
          );
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
          const bound = bindCourseToolArgs(
            slot?.current ?? { kind: "none" },
            "get_course_sections",
            args,
          );
          if (bound.action === "clarify") return bound.result;
          return runReadOnlyTool(
            "get_course_sections",
            bound.args,
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
      ...createTimetableTools(
        timetable ?? unavailableTimetableSlot,
        slot ?? { current: { kind: "none" } as CourseReferent },
        fakeDeps,
      ),
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
  const { useSyncExternalStore } = await import("react");
  const { plannerState } = await import("@/tests/helpers/planner-state");
  return {
    useTimetablePlanner: () => {
      const snapshot = useSyncExternalStore(
        (listener) => {
          plannerSync.listeners.add(listener);
          return () => plannerSync.listeners.delete(listener);
        },
        () => {
          if (plannerSync.revision !== plannerSync.cachedRevision || !plannerSync.cachedSnapshot) {
            plannerSync.cachedRevision = plannerSync.revision;
            plannerSync.cachedSnapshot = plannerState(h.plan as never, h.plannerOverrides);
          }
          return plannerSync.cachedSnapshot;
        },
        () => plannerState(h.plan as never, h.plannerOverrides),
      );
      return {
        ...snapshot,
        addSection: h.mutate,
        replaceSection: h.mutate,
        removeSection: h.mutate,
        createPlan: h.mutate,
        deletePlan: h.mutate,
        renamePlan: h.mutate,
        setActivePlan: h.mutate,
      };
    },
  };
});

import * as route from "@/app/api/copilotkit/[[...slug]]/route";
import AssistantPanel from "@/components/assistant/assistant-panel";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";
import {
  TIMETABLE_CONTEXT_DESCRIPTION,
} from "@/lib/assistant/timetable-context";
import { TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION } from "@/lib/assistant/timetable-previews";
import { TIMETABLE_SCENARIO_DESCRIPTION } from "@/lib/assistant/timetable-scenario";

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
    if (message.role !== "assistant") continue;
    const content = message.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part.type === "tool-call") names.push(part.toolName);
    }
  }
  return names;
}

function describeCall(prompt: LanguageModelV3Prompt): ModelCall {
  const system = prompt.flatMap((message) => (message.role === "system" ? [message.content] : [])).join("\n");
  const marker = `${PAGE_CONTEXT_DESCRIPTION}:\n`;
  const at = system.indexOf(marker);
  const page = at < 0 ? undefined : JSON.parse(system.slice(at + marker.length).split("\n")[0]);

  let digest: TimetableDigest | undefined;
  const digestMarker = `${TIMETABLE_CONTEXT_DESCRIPTION}:\n`;
  const digestAt = system.indexOf(digestMarker);
  if (digestAt >= 0) {
    const valueLine = system.slice(digestAt + digestMarker.length).split("\n")[0];
    if (valueLine.startsWith("{")) {
      digest = JSON.parse(valueLine);
    }
  }

  let previews: TimetablePreviewsContext | undefined;
  const previewsMarker = `${TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION}:\n`;
  const previewsAt = system.indexOf(previewsMarker);
  if (previewsAt >= 0) {
    const valueLine = system.slice(previewsAt + previewsMarker.length).split("\n")[0];
    if (valueLine.startsWith("{")) {
      previews = JSON.parse(valueLine);
    }
  }

  let scenario: TimetableScenarioContext | undefined;
  const scenarioMarker = `${TIMETABLE_SCENARIO_DESCRIPTION}:\n`;
  const scenarioAt = system.indexOf(scenarioMarker);
  if (scenarioAt >= 0) {
    const valueLine = system.slice(scenarioAt + scenarioMarker.length).split("\n")[0];
    if (valueLine.startsWith("{")) {
      scenario = JSON.parse(valueLine);
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
    digest,
    previews,
    scenario,
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

function planWithEconSection002() {
  const sections = FIXTURE_PLAN.payload.sections.map((section) =>
    section.courseCode === "ECON1001"
      ? normalizePlanSection({
          courseCode: "ECON1001",
          prof: "CHEUNG WAI",
          section: "002",
          schedules: [
            { date: "TUE", time: "15:00-16:15", location: "E21-2001" },
            { date: "THU", time: "15:00-16:15", location: "E21-2001" },
          ],
        })
      : section,
  );
  return { ...FIXTURE_PLAN, payload: { schemaVersion: 1 as const, sections } };
}

function v23Brain(call: ModelCall): Step {
  if (call.lastTool) {
    if (call.lastTool.name === PREVIEW_TIMETABLE_TOOL_NAME) {
      return { text: "Here is your timetable preview." };
    }
    if (call.lastTool.name === CHECK_PLAN_CONFLICTS_TOOL_NAME) {
      return { text: "Here is the conflict check." };
    }
    return { text: "Here is the interpretation." };
  }

  if (/Do I have any clashes/i.test(call.lastUser)) {
    return { text: "Yes, you have a Tuesday overlap." };
  }
  if (/Show me my timetable/i.test(call.lastUser)) {
    return { tool: PREVIEW_TIMETABLE_TOOL_NAME, input: {} };
  }
  if (/What if I take MATH1010 section 001/i.test(call.lastUser)) {
    return {
      tool: PREVIEW_TIMETABLE_TOOL_NAME,
      input: { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
    };
  }
  if (/Will this course conflict with my timetable/i.test(call.lastUser)) {
    return {
      tool: CHECK_PLAN_CONFLICTS_TOOL_NAME,
      input: { code: "MATH1010", instructor: "HO SIU MING" },
    };
  }
  if (/What about Wednesday afternoon/i.test(call.lastUser)) {
    return { text: "Wednesday afternoon is busy with MATH1010." };
  }
  if (/Would that fix the Monday conflict/i.test(call.lastUser)) {
    return { text: "The preview is hypothetical and not saved." };
  }
  if (/What about the morning conflicts/i.test(call.lastUser)) {
    return { text: "The preview shows a Monday morning overlap." };
  }
  if (/What's on my timetable/i.test(call.lastUser)) {
    return { text: "Your plan is in the digest." };
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
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
});

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  vi.stubGlobal("Request", NativeRequest);
  vi.stubGlobal("fetch", routeFetch);
  h.runs = [];
  h.rateLimitCalls = 0;
  h.rateLimit = { allowed: true };
  h.access = true;
  h.plan = FIXTURE_PLAN;
  h.plannerOverrides = undefined;
  plannerSync.revision = 0;
  plannerSync.cachedRevision = -1;
  plannerSync.cachedSnapshot = null;
  plannerSync.listeners.clear();
  plannerSync.bump();
  h.mutate.mockClear();
  h.brain = v23Brain as never;
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

describe("assistant V2.3 integration (scripted model)", () => {
  it("answers from the digest without a tool or a preview (A1–A4, A6)", async () => {
    await mountAssistant();
    await typeAndSend("Do I have any clashes?");
    const call = runs().at(-1)!.modelCalls[0];
    expect(call.digest?.conflicts?.[0]?.overlap).toBe("10:00-10:15");
    expect(call.digest?.days?.WED?.afternoon).toBe("busy");
    expect(call.toolNames).toEqual([]);
    expect(screen.queryByRole("region", { name: /timetable preview/i })).toBeNull();
    expect(h.rateLimitCalls).toBe(1);
    expect(h.mutate).not.toHaveBeenCalled();
  }, 60_000);

  it("shows the saved preview when the model calls preview_timetable (A5, A9)", async () => {
    await mountAssistant();
    await typeAndSend("Show me my timetable.");
    await waitFor(
      () => expect(screen.getByRole("region", { name: "Saved timetable preview" })).toBeTruthy(),
      { timeout: 10000 },
    );
    expect(screen.getByRole("tab", { name: "Tuesday, 2 classes, has a conflict" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("Built timetable preview")).toBeTruthy();
    expect(h.rateLimitCalls).toBe(1);
    expect(h.mutate).not.toHaveBeenCalled();
  }, 60_000);

  it("shows a hypothetical preview without touching the planner (A7, A10)", async () => {
    await mountAssistant();
    await typeAndSend("What if I take MATH1010 section 001 with HO SIU MING instead?");
    await waitFor(
      () => expect(screen.getByRole("region", { name: "Hypothetical timetable preview" })).toBeTruthy(),
      { timeout: 10000 },
    );
    expect(screen.getByRole("heading", { name: "Preview · Not saved" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Monday/ }));
    expect(screen.getByText("Replaces MATH1010-002")).toBeTruthy();
    expect(h.rateLimitCalls).toBe(1);
    expect(h.mutate).not.toHaveBeenCalled();
  }, 60_000);

  it("checks every section of the page course on the server (A8)", async () => {
    await mountAssistant();
    await act(async () => {
      nav.set("/course/MATH1010");
    });
    await waitFor(() => expect(nav.get()).toBe("/course/MATH1010"));
    await typeAndSend("Will this course conflict with my timetable?");
    const run = runs().at(-1)!;
    expect(run.modelCalls[0].page).toMatchObject({ page: "course", courseCode: "MATH1010" });
    const conflictCall = run.modelCalls.find((entry) => entry.lastTool?.name === CHECK_PLAN_CONFLICTS_TOOL_NAME);
    expect(conflictCall).toBeTruthy();
    const parsed = JSON.parse(conflictCall!.lastTool!.output);
    expect(parsed).toMatchObject({ status: "checked" });
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections.find((entry: { section: string }) => entry.section === "003")).toMatchObject({
      complete: false,
    });
    expect(screen.queryByRole("region", { name: /timetable preview/i })).toBeNull();
    expect(h.rateLimitCalls).toBe(1);
    expect(h.mutate).not.toHaveBeenCalled();
  }, 60_000);

  it("reads the updated planner after a manual change (Scenario C)", async () => {
    await mountAssistant();
    await typeAndSend("Do I have any clashes?");
    expect(runs().at(-1)!.modelCalls[0].digest?.conflicts).toHaveLength(1);

    h.plan = planWithEconSection002();
    plannerSync.bump();
    await typeAndSend("Do I still have conflicts?");
    const call = runs().at(-1)!.modelCalls[0];
    expect(call.digest?.conflicts).toEqual([]);
    expect(call.scenario).toMatchObject({ kind: "saved" });
    expect(h.mutate).not.toHaveBeenCalled();
  }, 90_000);

  it("keeps a hypothetical preview separate on the follow-up (Scenario D)", async () => {
    await mountAssistant();
    await typeAndSend("What if I take MATH1010 section 001 with HO SIU MING instead?");
    await waitFor(
      () => expect(screen.getByRole("region", { name: "Hypothetical timetable preview" })).toBeTruthy(),
      { timeout: 10000 },
    );

    await typeAndSend("Would that fix the Monday conflict?");
    const call = runs().at(-1)!.modelCalls[0];
    expect(call.previews?.previews[0]?.kind).toBe("hypothetical");
    expect(call.scenario).toMatchObject({ kind: "preview", previewKind: "hypothetical" });
    expect(call.digest?.sections?.some((section) => section.id === "MATH1010-002")).toBe(true);
    expect(h.mutate).not.toHaveBeenCalled();
  }, 90_000);

  it("followup_hypo: morning conflicts referent stays on the hypothetical preview", async () => {
    await mountAssistant();
    await typeAndSend("What if I take MATH1010 section 001 with HO SIU MING instead?");
    await waitFor(
      () => expect(screen.getByRole("region", { name: "Hypothetical timetable preview" })).toBeTruthy(),
      { timeout: 10000 },
    );

    await typeAndSend("What about the morning conflicts?");
    const call = runs().at(-1)!.modelCalls[0];
    expect(call.scenario).toMatchObject({ kind: "preview", previewKind: "hypothetical" });
    const morning = call.previews?.previews[0]?.morningConflicts?.join(" ") ?? "";
    expect(morning).toMatch(/CISC3014/);
    expect(morning).toMatch(/10:00/);
    expect(h.mutate).not.toHaveBeenCalled();
  }, 90_000);

  it("keeps the 'what about Wednesday' follow-up on the timetable (Scenario B)", async () => {
    await mountAssistant();
    await act(async () => {
      nav.set("/course/CISC2001");
    });
    await waitFor(() => expect(nav.get()).toBe("/course/CISC2001"));
    await typeAndSend("Do I have any clashes?");
    const firstPage = runs().at(-1)!.modelCalls[0].page;

    await typeAndSend("What about Wednesday afternoon?");
    const followUp = runs().at(-1)!.modelCalls[0];
    expect(followUp.digest?.status).toBe("ready");
    expect(followUp.page).toEqual(firstPage);
    expect(h.mutate).not.toHaveBeenCalled();
  }, 90_000);

  it("tells an empty planner apart from a failed read", async () => {
    h.plan = undefined;
    await mountAssistant();
    await typeAndSend("What's on my timetable?");
    expect(runs().at(-1)!.modelCalls[0].digest?.status).toBe("no_plan");
    expect(h.mutate).not.toHaveBeenCalled();
    cleanup();

    h.plan = undefined;
    h.plannerOverrides = { serverLoad: "failed" };
    plannerSync.bump();
    await mountAssistant();
    await typeAndSend("What's on my timetable?");
    expect(runs().at(-1)!.modelCalls[0].digest?.status).toBe("unavailable");
    expect(h.mutate).not.toHaveBeenCalled();
    cleanup();

    h.plannerOverrides = { loadState: "loading" };
    plannerSync.bump();
    await mountAssistant();
    await typeAndSend("What's on my timetable?");
    expect(runs().at(-1)!.modelCalls[0].digest?.status).toBe("loading");
    expect(h.mutate).not.toHaveBeenCalled();
  }, 90_000);

  it("clears earlier previews on New chat", async () => {
    await mountAssistant();
    await typeAndSend("Show me my timetable.");
    await waitFor(
      () => expect(screen.getByRole("region", { name: "Saved timetable preview" })).toBeTruthy(),
      { timeout: 10000 },
    );

    fireEvent.click(screen.getByRole("button", { name: "New chat" }));
    await typeAndSend("Do I have any clashes?");
    expect(runs().at(-1)!.modelCalls[0].previews).toEqual({ previews: [] });
    expect(h.mutate).not.toHaveBeenCalled();
  }, 90_000);

  it("keeps the timetable context after closing and reopening the sidebar", async () => {
    await mountAssistant();
    await act(async () => {
      nav.set("/timetable");
    });
    await waitFor(() => expect(nav.get()).toBe("/timetable"));

    await typeAndSend("Do I have any clashes?");
    expect(runs().at(-1)!.modelCalls[0].digest?.status).toBe("ready");

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByLabelText("Ask about courses")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "AI Course Helper" }));
    await waitFor(() => expect(screen.getByLabelText("Ask about courses")).toBeTruthy());

    await typeAndSend("What's on my timetable?");
    expect(runs().at(-1)!.modelCalls[0].digest?.status).toBe("ready");
    expect(h.mutate).not.toHaveBeenCalled();
  }, 90_000);
});
