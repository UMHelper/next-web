import type { LanguageModelV3Prompt, LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { Request as NativeRequest } from "undici";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRateLimitOutcome } from "@/lib/assistant/rate-limit";
import { DEFAULT_APP_CONFIG } from "@/lib/config/app-config-core";
import { runDiscoverCourseCandidates } from "@/lib/assistant/discovery/discover";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { timetableVersion } from "@/lib/timetable/analysis";
import type { DiscoveryPool, PoolCourse, PoolInstructorRow, PoolOffer } from "@/lib/assistant/discovery/pool";
import type { PlannerReadState } from "@/lib/assistant/timetable-context";
import { MAX_RUN_BODY_BYTES } from "@/lib/assistant/conversation";
import { DEFAULT_HISTORY_TURNS, prepareRunMessages, runPayloadBytes } from "@/lib/assistant/run-messages";
import { McpToolError } from "@/lib/mcp/errors";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";
import { normalizePlanSection } from "@/lib/timetable/schema";
import { offer, pool, poolCourse, pwcRow } from "@/tests/fixtures/discovery-pool";

/**
 * Real AssistantPanel, CopilotKit provider, /api/copilotkit route, and assistant server tools
 * with mocked data adapters only. Proves V2.3.5-B discovery journeys end to end.
 */

type Step =
  | { text: string }
  | { tool: string; input: Record<string, unknown> }
  | { tools: { tool: string; input: Record<string, unknown> }[] };

type TimetableDigest = {
  status: string;
  plan?: { version?: string; term?: string };
};

type ModelCall = {
  page: unknown;
  digest?: TimetableDigest;
  discussed?: string;
  visibleBlocks?: {
    latestTurn: number;
    turns: Array<{ turn: number; blocks: Array<{ kind: string; courses?: string[] }> }>;
  };
  toolNames: string[];
  system: string;
  lastUser: string;
  lastTool?: { name: string; output: string };
  userMessages: string[];
  toolResults: string[];
};

type RunRecord = { body: { messages: Array<{ role: string; content?: unknown; toolCallId?: string }> }; modelCalls: ModelCall[] };

const data = vi.hoisted(() => ({
  getCourse: vi.fn(),
  getCourseReviews: vi.fn(),
  getCourseSections: vi.fn(),
  searchCatalogForAssistant: vi.fn(),
  countCoursesForAssistant: vi.fn(),
  getInstructorForAssistant: vi.fn(),
  countCourseReviews: vi.fn(),
  getCourseText: vi.fn(),
  getAppConfig: vi.fn(),
}));

const discovery = vi.hoisted(() => ({
  loadDiscoveryPool: vi.fn(),
  loadReviewTexts: vi.fn(),
}));

const plannerSync = vi.hoisted(() => ({
  revision: 0,
  listeners: new Set<() => void>(),
  cachedRevision: -1,
  cachedSnapshot: null as ReturnType<typeof import("@/tests/helpers/planner-state").plannerState> | null,
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
  discoveryFails: false,
  useCompactionPool: false,
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

const DISCOVER_ARGS = {
  scope: { courseType: "GE" },
  required: { startAfter: "10:00", avoidDays: ["FRI"], noClash: true },
};

const PRESENT_RECOMMENDATIONS = {
  recommendations: { courses: ["GEST1006-002", "GESB1013"] },
};

function gegaPlanFixture() {
  return {
    clientRef: "plan-ge",
    name: "GE plan",
    year: 2026,
    sem: 1,
    revision: 1,
    syncState: "idle" as const,
    payload: {
      schemaVersion: 1 as const,
      sections: [
        normalizePlanSection({
          courseCode: "GEGA1000",
          prof: "CHAN",
          section: "007",
          schedules: [
            { date: "MON", time: "13:00-14:15", location: "E11" },
            { date: "THU", time: "13:00-14:15", location: "E11" },
          ],
        }),
      ],
    },
  };
}

function planWithGestOverlap() {
  return {
    ...gegaPlanFixture(),
    revision: 2,
    payload: {
      schemaVersion: 1 as const,
      sections: [
        ...gegaPlanFixture().payload.sections,
        normalizePlanSection({
          courseCode: "ART1001",
          prof: "LAM",
          section: "001",
          schedules: [{ date: "TUE", time: "11:30-12:45", location: "E11" }],
        }),
      ],
    },
  };
}

function scenarioDiscoveryPool(): DiscoveryPool {
  return pool({
    totalMatchingCourses: 6,
    courses: [
      poolCourse({ courseCode: "GEST1006", courseType: "GE", department: "GEST", titleEn: "Science in Daily Life" }),
      poolCourse({ courseCode: "GESB1013", courseType: "GE", department: "GESB", titleEn: "Ethics and Society" }),
      poolCourse({ courseCode: "CISC1001", courseType: "GE", department: "CISC", faculty: "FST", titleEn: "Computing" }),
      poolCourse({ courseCode: "GEST1002", courseType: "GE" }),
      poolCourse({ courseCode: "GEST1003", courseType: "GE" }),
    ],
    instructorRows: [
      pwcRow({ pwcId: 1, courseCode: "GEST1006", instructor: "WONG SIU MING" }),
      pwcRow({ pwcId: 2, courseCode: "GESB1013", instructor: "LEE MEI LING" }),
      pwcRow({ pwcId: 101, courseCode: "CISC1001", instructor: "LEE KA CHUN" }),
      pwcRow({ pwcId: 12, courseCode: "GEST1002" }),
      pwcRow({ pwcId: 13, courseCode: "GEST1003" }),
    ],
    offers: [
      offer(1, "002", ["TUE 11:30-12:45 E11", "THU 11:30-12:45 E11"]),
      offer(2, "001", ["WED 10:00-11:15 E11"]),
      offer(101, "001", ["MON 13:30-14:45 E11", "THU 13:30-14:45 E11", "WED 08:30-09:45 E11"]),
      offer(12, "001", ["FRI 11:00-12:15 E11"]),
      offer(13, "001", ["MON 09:00-10:15 E11"]),
    ],
  });
}

function buildCompactionPool(): DiscoveryPool {
  const courses: PoolCourse[] = [];
  const instructorRows: PoolInstructorRow[] = [];
  const offers: PoolOffer[] = [];
  let pwcId = 1;

  for (let courseIndex = 0; courseIndex < 60; courseIndex += 1) {
    const courseCode = `PERF${String(courseIndex).padStart(4, "0")}`;
    courses.push(
      poolCourse({
        courseCode,
        titleEn: `Performance course ${courseIndex} `.repeat(8),
        courseType: "GE",
        suggestedYear: (courseIndex % 4) + 1,
        topicBody: courseIndex % 3 === 0 ? "Macao history elective ".repeat(40) : "",
      }),
    );

    for (let sectionIndex = 0; sectionIndex < 5; sectionIndex += 1) {
      const section = String(sectionIndex + 1).padStart(3, "0");
      instructorRows.push(
        pwcRow({
          pwcId,
          courseCode,
          instructor: `INST ${courseCode}-${section}`,
          reviews: sectionIndex * 4,
          difficulty: 2 + (sectionIndex % 4),
          grade: 3,
          result: 4,
          reward: 3,
        }),
      );
      offers.push(
        offer(pwcId, section, [
          `TUE ${10 + (sectionIndex % 3)}:30-${11 + (sectionIndex % 3)}:45 E11`,
          `THU ${10 + (sectionIndex % 3)}:30-${11 + (sectionIndex % 3)}:45 E11`,
        ]),
      );
      pwcId += 1;
    }
  }

  return pool({
    totalMatchingCourses: courses.length,
    truncated: false,
    courses,
    instructorRows,
    offers,
  });
}

function courseRow(courseCode: string, titleEn: string) {
  return {
    course: {
      courseCode,
      titleEn,
      titleZh: null,
      credits: "3",
      faculty: "FST",
      department: courseCode.slice(0, 4),
      programLevel: "UG",
      suggestedYear: "1",
      medium: "English",
      gradingSystem: "Graded",
      courseType: "GE",
      duration: "One semester",
      description: `${titleEn} description.`,
      aka: [],
      isOffered: true,
      url: absoluteUrl(buildCoursePath(courseCode)),
    },
    page: 1,
    hasMore: false,
    totalCount: 1,
    instructors: [
      {
        name: "LEE MEI LING",
        commentCount: 12,
        result: 4,
        attendance: 3,
        grade: 3.5,
        difficulty: 3,
        reward: 3.5,
        isOffered: true,
        reviewUrl: absoluteUrl(buildReviewPath(courseCode, "LEE MEI LING")),
      },
    ],
  };
}

function wireFixtures() {
  data.getAppConfig.mockResolvedValue({ ...DEFAULT_APP_CONFIG });
  data.getCourseText.mockImplementation(async (code: string) => ({
    courseCode: code.trim().toUpperCase(),
    text: "Full text.",
  }));
  data.countCoursesForAssistant.mockResolvedValue({ totalCount: 0 });
  data.countCourseReviews.mockResolvedValue({ totalCount: 12 });
  data.getInstructorForAssistant.mockRejectedValue(new McpToolError("not_found"));
  data.searchCatalogForAssistant.mockImplementation(async (input: { type?: string; query?: string }) => {
    if (input.type === "course" && input.query === "CISC") {
      return {
        type: "course" as const,
        page: 1,
        hasMore: false,
        totalCount: 1,
        results: [
          {
            courseCode: "CISC1001",
            titleEn: "Programming",
            titleZh: null,
            faculty: "FST",
            department: "CISC",
            credits: "3",
            isOffered: true,
            aka: [] as string[],
            url: absoluteUrl(buildCoursePath("CISC1001")),
          },
        ],
      };
    }
    throw new McpToolError("not_found");
  });

  data.getCourse.mockImplementation(async (input: { code: string }) => {
    const code = input.code.trim().toUpperCase();
    if (code === "GEST1006") return courseRow(code, "Science in Daily Life");
    if (code === "GESB1013") return courseRow(code, "Ethics and Society");
    throw new McpToolError("not_found");
  });

  data.getCourseReviews.mockRejectedValue(new McpToolError("not_found"));
  data.getCourseSections.mockRejectedValue(new McpToolError("not_found"));

  discovery.loadReviewTexts.mockResolvedValue([]);
  discovery.loadDiscoveryPool.mockImplementation(async () => {
    if (h.discoveryFails) throw new McpToolError("temporarily_unavailable");
    if (h.useCompactionPool) return buildCompactionPool();
    return scenarioDiscoveryPool();
  });
}

vi.mock("server-only", () => ({}));
vi.mock("@/lib/config/app-config", () => ({ getAppConfig: data.getAppConfig }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: data.getCourse }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: data.getCourseReviews }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: data.getCourseSections }));
vi.mock("@/lib/assistant/data/search-catalog", () => ({
  searchCatalogForAssistant: data.searchCatalogForAssistant,
  countCoursesForAssistant: data.countCoursesForAssistant,
}));
vi.mock("@/lib/assistant/data/instructor", () => ({
  getInstructorForAssistant: data.getInstructorForAssistant,
}));
vi.mock("@/lib/assistant/data/reviews", () => ({
  countCourseReviews: data.countCourseReviews,
}));
vi.mock("@/lib/assistant/data/course-text", () => ({
  getCourseText: data.getCourseText,
}));
vi.mock("@/lib/assistant/data/discovery", () => ({
  loadDiscoveryPool: discovery.loadDiscoveryPool,
  loadReviewTexts: discovery.loadReviewTexts,
  MAX_POOL_COURSES: 150,
  IN_CHUNK: 200,
}));

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
      return snapshot;
    },
  };
});

import * as route from "@/app/api/copilotkit/[[...slug]]/route";
import AssistantPanel from "@/components/assistant/assistant-panel";
import { DISCUSSED_COURSES_CONTEXT_DESCRIPTION } from "@/lib/assistant/discussed-courses";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";
import { TIMETABLE_CONTEXT_DESCRIPTION } from "@/lib/assistant/timetable-context";
import { VISIBLE_BLOCKS_CONTEXT_DESCRIPTION } from "@/lib/assistant/visible-blocks";

const runs = () => h.runs as RunRecord[];

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

let toolCallCount = 0;
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
      chunks.push({
        type: "tool-call",
        toolCallId: `tool-${toolCallCount}`,
        toolName: entry.tool,
        input: JSON.stringify(entry.input),
      });
    }
    chunks.push({ type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage });
    return chunks;
  }
  toolCallCount++;
  return [
    { type: "stream-start", warnings: [] },
    {
      type: "tool-call",
      toolCallId: `tool-${toolCallCount}`,
      toolName: step.tool,
      input: JSON.stringify(step.input),
    },
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

function parseContextLine(system: string, marker: string): unknown {
  const at = system.indexOf(marker);
  if (at < 0) return undefined;
  const valueLine = system.slice(at + marker.length).split("\n")[0];
  if (!valueLine.startsWith("{")) return undefined;
  return JSON.parse(valueLine);
}

function describeCall(prompt: LanguageModelV3Prompt): ModelCall {
  const system = prompt.flatMap((message) => (message.role === "system" ? [message.content] : [])).join("\n");
  const page = parseContextLine(system, `${PAGE_CONTEXT_DESCRIPTION}:\n`);
  const digest = parseContextLine(system, `${TIMETABLE_CONTEXT_DESCRIPTION}:\n`) as TimetableDigest | undefined;
  const discussed = parseContextLine(system, `${DISCUSSED_COURSES_CONTEXT_DESCRIPTION}:\n`) as string | undefined;
  const visibleBlocks = parseContextLine(system, `${VISIBLE_BLOCKS_CONTEXT_DESCRIPTION}:\n`) as ModelCall["visibleBlocks"];

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
    discussed,
    visibleBlocks,
    toolNames: toolNamesFrom(prompt),
    system,
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

function v235BBrain(call: ModelCall): Step {
  if (/List the CIS courses/i.test(call.lastUser)) {
    if (call.lastTool?.name === "present_response") {
      return { text: "Here are the CIS courses in the catalog." };
    }
    if (call.lastTool?.name === "search_catalog") {
      return { tool: "present_response", input: { catalog: { mode: "browse" } } };
    }
    if (!call.lastTool) {
      return { tool: "search_catalog", input: { type: "course", query: "CISC" } };
    }
  }

  if (/tell me more about the second one/i.test(call.lastUser)) {
    if (call.discussed?.includes("GESB1013")) {
      return { text: "GESB1013 covers ethics and society topics." };
    }
    if (call.lastTool?.name === "get_course") {
      return { text: "GESB1013 covers ethics and society topics." };
    }
    return { tool: "get_course", input: { code: "GESB1013" } };
  }

  if (call.lastTool) {
    if (/Find GE courses that fit my timetable/i.test(call.lastUser)) {
      if (call.lastTool.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME) {
        return { tool: "present_response", input: PRESENT_RECOMMENDATIONS };
      }
      if (call.lastTool.name === "present_response") {
        return { text: "Here are two GE options that fit your constraints." };
      }
    }
    if (/Re-check those GE options/i.test(call.lastUser)) {
      if (call.lastTool.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME) {
        return { text: "GEST1006-002 now clashes with your updated timetable." };
      }
    }
    if (/^GE discovery turn \d$/i.test(call.lastUser.trim())) {
      if (call.lastTool.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME) {
        return { text: "Listed more GE candidates." };
      }
    }
    if (/GE discovery failed/i.test(call.lastUser)) {
      return { text: "I could not run discovery just now." };
    }
    return { text: "Here is the interpretation." };
  }

  if (/Find GE courses that fit my timetable/i.test(call.lastUser)) {
    return { tool: DISCOVER_COURSE_CANDIDATES_TOOL_NAME, input: DISCOVER_ARGS };
  }
  if (/Re-check those GE options/i.test(call.lastUser)) {
    return {
      tool: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
      input: { scope: { courseType: "GE" }, limit: 8 },
    };
  }
  if (/^GE discovery turn \d$/i.test(call.lastUser.trim())) {
    return { tool: DISCOVER_COURSE_CANDIDATES_TOOL_NAME, input: DISCOVER_ARGS };
  }
  if (/GE discovery failed/i.test(call.lastUser)) {
    return { tool: DISCOVER_COURSE_CANDIDATES_TOOL_NAME, input: DISCOVER_ARGS };
  }
  return { text: "ok" };
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
      if (signature === lastSignature) stableChecks++;
      else {
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

function discoverOutputs() {
  return runs()
    .flatMap((run) => run.modelCalls)
    .flatMap((call) => call.toolResults)
    .filter((output) => output.includes('"candidates"'));
}

function assertScenarioEConstraints(output: string) {
  const parsed = JSON.parse(output) as {
    candidates: Array<{ courseCode: string; meetings: string[] }>;
    excluded: { required: { startAfter: number; avoidDays: number; noClash: number } };
  };
  expect(parsed.candidates.some((candidate) => candidate.courseCode === "CISC1001")).toBe(false);
  expect(parsed.excluded.required.startAfter).toBeGreaterThan(0);
  expect(parsed.excluded.required.avoidDays).toBeGreaterThan(0);
  for (const candidate of parsed.candidates) {
    for (const meeting of candidate.meetings) {
      expect(meeting.startsWith("FRI")).toBe(false);
      const timeToken = meeting.split(" ")[1] ?? "";
      const start = timeToken.split("-")[0] ?? "";
      const [hours, minutes] = start.split(":").map(Number);
      expect(hours * 60 + minutes).toBeGreaterThanOrEqual(10 * 60);
    }
  }
}

function toolMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === undefined || content === null) return "";
  return JSON.stringify(content);
}

function discoverToolMessages(messages: RunRecord["body"]["messages"]) {
  return messages.filter(
    (message) => message.role === "tool" && toolMessageText(message.content).includes('"candidates"'),
  );
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
  h.plan = gegaPlanFixture();
  h.plannerOverrides = undefined;
  h.discoveryFails = false;
  h.useCompactionPool = false;
  h.brain = v235BBrain as never;
  nav.landOnPush = true;
  nav.pushes = [];
  toolCallCount = 0;
  inflightRunPosts = 0;
  plannerSync.revision = 0;
  plannerSync.cachedRevision = -1;
  plannerSync.cachedSnapshot = null;
  plannerSync.listeners.clear();
  plannerSync.bump();
  wireFixtures();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("assistant V2.3.5-B integration (discovery through CopilotKit)", () => {
  it("J1 scenario E: discovery shortlist with clash-free badge and one activity summary", async () => {
    await mountAssistant();
    await typeAndSend("Find GE courses that fit my timetable.");

    const discoverOutput = discoverOutputs().at(-1);
    expect(discoverOutput).toBeTruthy();
    assertScenarioEConstraints(discoverOutput!);

    await waitFor(() => expect(screen.getByText("Recommended courses")).toBeTruthy(), { timeout: 10000 });
    expect(screen.getByText(/Sec 002/)).toBeTruthy();
    expect(screen.getAllByText("No clash with saved timetable").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Offered only")).toBeNull();
    expect(screen.getByRole("button", { name: "Show 1 tool step" })).toBeTruthy();
  }, 120_000);

  it("J2 planner change: stale shortlist badge and rediscovered confirmed clash", async () => {
    await mountAssistant();
    await typeAndSend("Find GE courses that fit my timetable.");
    await waitFor(
      () => expect(screen.getAllByText("No clash with saved timetable").length).toBeGreaterThanOrEqual(1),
      { timeout: 10000 },
    );

    const firstDigestVersion = runs().at(-1)!.modelCalls[0]?.digest?.plan?.version;
    expect(firstDigestVersion).toBeTruthy();
    const discoverPlannerVersion = JSON.parse(discoverOutputs()[0]!).timetable.plannerVersion as string;
    const versionBefore = timetableVersion(gegaPlanFixture().payload.sections);
    const versionAfter = timetableVersion(planWithGestOverlap().payload.sections);
    expect(versionBefore).toBe(discoverPlannerVersion);
    expect(versionAfter).not.toBe(versionBefore);

    await act(async () => {
      h.plan = planWithGestOverlap();
      plannerSync.bump();
    });

    await waitFor(
      () => expect(screen.getAllByText("Timetable changed – ask me to re-check").length).toBeGreaterThanOrEqual(1),
      { timeout: 10000 },
    );
    expect(screen.queryByText("No clash with saved timetable")).toBeNull();

    await typeAndSend("Re-check those GE options.");
    const recheckCall = runs().at(-1)!.modelCalls[0];
    expect(recheckCall.digest?.plan?.version).not.toBe(firstDigestVersion);

    const recheckRun = runs().at(-1)!;
    const secondDiscover = recheckRun.modelCalls
      .filter((call) => call.lastTool?.name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME)
      .at(-1)!.lastTool!.output;
    const parsed = JSON.parse(secondDiscover) as {
      candidates: Array<{ courseCode: string; section: string; fit: string }>;
    };
    expect(parsed.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          courseCode: "GEST1006",
          section: "002",
          fit: "confirmed_clash",
        }),
      ]),
    );
  }, 120_000);

  it("J3 ordinal follow-up: visible recommendations order resolves to GESB1013", async () => {
    await mountAssistant();
    await typeAndSend("Find GE courses that fit my timetable.");
    await typeAndSend("tell me more about the second one");

    const followUp = runs().at(-1)!.modelCalls[0];
    const recommendationsBlock = followUp.visibleBlocks?.turns
      .flatMap((entry) => entry.blocks)
      .find((block) => block.kind === "recommendations");
    expect(recommendationsBlock?.courses).toEqual(["GEST1006", "GESB1013"]);
  }, 120_000);

  it("J4 failure envelope: discovery error in activity and no shortlist", async () => {
    h.discoveryFails = true;
    await mountAssistant();
    await typeAndSend("GE discovery failed");

    expect(screen.queryByText("Recommended courses")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 1 tool step" }));
    await waitFor(() => expect(screen.getByText("Lookup failed")).toBeTruthy());
  }, 60_000);

  it("J5 history compaction: three discovery turns stay under the run body cap", async () => {
    h.useCompactionPool = true;
    const planSections = gegaPlanFixture().payload.sections;
    const direct = await runDiscoverCourseCandidates(
      {
        status: "ready",
        plan: { name: "GE plan", year: 2026, sem: 1, sections: planSections },
        currentTerm: { year: 2026, sem: 1 },
        otherPlansThisTerm: 0,
        localOnly: false,
        truncated: false,
        version: timetableVersion(planSections),
      },
      DISCOVER_ARGS,
      {
        loadCatalogTerm: async () => ({ year: 2026, sem: 1 }),
        loadPool: async () => buildCompactionPool(),
        loadReviews: async () => [],
      },
    );
    expect(JSON.stringify(direct).includes('"candidates"')).toBe(true);
    expect(JSON.stringify(direct).length).toBeGreaterThan(500);

    await mountAssistant();

    await typeAndSend("GE discovery turn 1");
    await typeAndSend("GE discovery turn 2");
    await typeAndSend("GE discovery turn 3");

    expect(discoverOutputs().length).toBeGreaterThanOrEqual(3);

    const wireMessages = runs().at(-1)!.body.messages;
    const prepared = prepareRunMessages(wireMessages, DEFAULT_HISTORY_TURNS);
    expect(runPayloadBytes(prepared)).toBeLessThanOrEqual(MAX_RUN_BODY_BYTES);

    const preparedTools = prepared.filter((message) => message.role === "tool");
    expect(preparedTools.length).toBeGreaterThanOrEqual(2);
    for (const message of preparedTools.slice(0, -1)) {
      expect(toolMessageText(message.content).length).toBeLessThanOrEqual(201);
    }
    expect(discoverOutputs().at(-1)!.length).toBeGreaterThan(500);
  }, 180_000);

  it("J6 browsing stays a catalog list and a recommendation stays a shortlist", async () => {
    await mountAssistant();
    await typeAndSend("List the CIS courses.");

    await waitFor(() => expect(screen.getByRole("list", { name: "Loaded courses" })).toBeTruthy(), {
      timeout: 10000,
    });
    expect(screen.getByRole("link", { name: /CISC1001/ })).toBeTruthy();
    expect(screen.queryByText("Recommended courses")).toBeNull();
    const browseCalls = runs().at(-1)!.modelCalls;
    expect(browseCalls.some((call) => call.toolNames.includes("search_catalog"))).toBe(true);
    expect(browseCalls.some((call) => call.toolNames.includes(DISCOVER_COURSE_CANDIDATES_TOOL_NAME))).toBe(false);

    await typeAndSend("Find GE courses that fit my timetable.");
    await waitFor(() => expect(screen.getByText("Recommended courses")).toBeTruthy(), { timeout: 10000 });
    expect(screen.getByRole("list", { name: "Loaded courses" })).toBeTruthy();

    const instructions = browseCalls[0]?.system ?? "";
    const selectionBullets = instructions
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("- ") &&
          line.includes("discover_course_candidates") &&
          !line.includes("present_response"),
      );
    expect(selectionBullets).toEqual([
      "- Pick the tool from the student's aim: browsing a list is search_catalog; choosing what to take, a subject or year's options, or anything shaped by constraints is discover_course_candidates, and one constraint is enough to act. Combined fit needs preview_timetable, not individual fits; when reviews matter, pass reviewTerms in that call, not get_course_reviews per course.",
    ]);
  }, 120_000);
});
