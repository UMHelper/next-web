import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Step = { text: string; reasoning?: string } | { tool: string; input: Record<string, unknown> };

const script = vi.hoisted(() => ({
  steps: [] as Array<{ text: string; reasoning?: string } | { tool: string; input: Record<string, unknown> }>,
}));

vi.mock("@/lib/mcp/data/search-catalog", async () => ({
  searchCatalog: (await import("@/evals/assistant/catalog")).searchCatalog,
}));
vi.mock("@/lib/mcp/data/get-course", async () => ({ getCourse: (await import("@/evals/assistant/catalog")).getCourse }));
vi.mock("@/lib/mcp/data/get-instructor", async () => ({
  getInstructor: (await import("@/evals/assistant/catalog")).getInstructor,
}));
vi.mock("@/lib/mcp/data/get-course-reviews", async () => ({
  getCourseReviews: (await import("@/evals/assistant/catalog")).getCourseReviews,
}));
vi.mock("@/lib/mcp/data/get-course-sections", async () => ({
  getCourseSections: (await import("@/evals/assistant/catalog")).getCourseSections,
}));
vi.mock("@/lib/assistant/data/search-catalog", async () => ({
  searchCatalogForAssistant: (await import("@/evals/assistant/catalog")).searchCatalogForAssistant,
  countCoursesForAssistant: (await import("@/evals/assistant/catalog")).countCoursesForAssistant,
}));
vi.mock("@/lib/assistant/data/course-text", async () => ({
  getCourseText: (await import("@/evals/assistant/catalog")).getCourseText,
}));
vi.mock("@/lib/assistant/data/instructor", async () => ({
  getInstructorForAssistant: (await import("@/evals/assistant/catalog")).getInstructorForAssistant,
}));
vi.mock("@/lib/assistant/data/reviews", async () => ({
  countCourseReviews: (await import("@/evals/assistant/catalog")).countCourseReviews,
}));
vi.mock("@/lib/assistant/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/model")>()),
  createAssistantModel: () => scriptedModel(),
}));

import type { EvalCase } from "@/evals/assistant/cases";
import { BudgetExhausted, runCase } from "@/evals/assistant/harness";
import { readAssistantConfig } from "@/lib/assistant/config";

const usage = {
  inputTokens: { total: 1000, noCache: 400, cacheRead: 600, cacheWrite: undefined },
  outputTokens: { total: 40, text: 40, reasoning: undefined },
};

let toolCallCount = 0;
function streamFor(step: Step): LanguageModelV3StreamPart[] {
  if ("text" in step) {
    const reasoning: LanguageModelV3StreamPart[] = step.reasoning
      ? [
          { type: "reasoning-start", id: "r" },
          { type: "reasoning-delta", id: "r", delta: step.reasoning },
          { type: "reasoning-end", id: "r" },
        ]
      : [];
    return [
      { type: "stream-start", warnings: [] },
      ...reasoning,
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

function scriptedModel() {
  return new MockLanguageModelV3({
    doStream: async () => {
      const step = script.steps.shift();
      if (!step) throw new Error("script ran out of steps");
      return {
        stream: simulateReadableStream({ initialDelayInMs: null, chunkDelayInMs: null, chunks: streamFor(step) }),
      };
    },
  });
}

const config = readAssistantConfig({ AI_API_KEY: "sk-test" });
const budget = () => ({ maxSteps: 10, used: 0 });
const singleTurn = (pathname: string, message: string): EvalCase => ({
  id: "harness",
  category: "explicit",
  pathname,
  why: "harness test",
  turns: [{ message, expect: { navigate: "optional" } }],
});

beforeEach(() => {
  script.steps = [];
});

describe("assistant eval harness", () => {
  it("handles navigate like CopilotKit: tool result, then one follow-up run on the new page", async () => {
    script.steps = [{ tool: "navigate", input: { destination: "course", code: "CISC3014" } }, { text: "Opened CISC3014." }];
    const spent = budget();

    const [trace] = await runCase(singleTurn("/", "Open CISC3014"), { config, budget: spent, repeat: 0 });

    expect(trace.pathnameAfter).toBe("/course/CISC3014");
    expect(trace.runs.map((run) => run.continuation)).toEqual([false, true]);
    expect(trace.runs.map((run) => run.steps.map((step) => step.finish))).toEqual([["tool-calls"], ["stop"]]);
    expect(trace.runs[0].steps[0]).toMatchObject({ inputTokens: 1000, cachedInputTokens: 600, outputTokens: 40, tools: ["navigate"] });
    expect(trace.toolCalls.map((call) => call.name)).toEqual(["navigate"]);
    expect(JSON.parse(trace.toolCalls[0].result!)).toMatchObject({ status: "navigated" });
    expect(trace.reply).toBe("Opened CISC3014.");
    expect(spent.used).toBe(2);
  });

  it("runs academic tools inside one run against the fixture catalog", async () => {
    script.steps = [{ tool: "get_course", input: { code: "CISC3014" } }, { text: "CISC3014 is Database Systems." }];

    const [trace] = await runCase(singleTurn("/", "What is CISC3014?"), { config, budget: budget(), repeat: 0 });

    expect(trace.runs).toHaveLength(1);
    expect(trace.runs[0].steps.map((step) => step.finish)).toEqual(["tool-calls", "stop"]);
    expect(trace.toolCalls[0]).toMatchObject({ name: "get_course", args: { code: "CISC3014" } });
    expect(trace.toolCalls[0].result).toContain("Database Systems");
    expect(trace.pathnameAfter).toBe("/");
  });

  it("refuses a second page in the same student message", async () => {
    script.steps = [
      { tool: "navigate", input: { destination: "course", code: "CISC3014" } },
      { tool: "navigate", input: { destination: "course", code: "CISC2001" } },
      { text: "Done." },
    ];

    const [trace] = await runCase(singleTurn("/", "Open CISC3014"), { config, budget: budget(), repeat: 0 });

    expect(trace.toolCalls.map((call) => JSON.parse(call.result!).status)).toEqual(["navigated", "limit_reached"]);
    expect(trace.pathnameAfter).toBe("/course/CISC3014");
    expect(trace.runs).toHaveLength(3);
  });

  it("gives the follow-up turn the page the previous turn opened", async () => {
    script.steps = [
      { tool: "navigate", input: { destination: "course", code: "CISC3014" } },
      { text: "Opened." },
      { tool: "get_course", input: { code: "CISC3014" } },
      { text: "CHAN TAI MAN teaches it." },
    ];
    const evalCase: EvalCase = {
      ...singleTurn("/", "Open CISC3014"),
      turns: [
        { message: "Open CISC3014", expect: { navigate: "required" } },
        { message: "Who teaches this course?", expect: { navigate: "forbidden" } },
      ],
    };

    const traces = await runCase(evalCase, { config, budget: budget(), repeat: 0 });

    expect(traces.map((trace) => trace.pathnameBefore)).toEqual(["/", "/course/CISC3014"]);
    expect(traces[1].toolCalls.map((call) => call.name)).toEqual(["get_course"]);
  });

  it("stops before calling the model once the step budget is used up", async () => {
    await expect(
      runCase(singleTurn("/", "Open CISC3014"), { config, budget: { maxSteps: 0, used: 0 }, repeat: 0 }),
    ).rejects.toBeInstanceOf(BudgetExhausted);
  });

  it("restores console.log after each run", async () => {
    const original = console.log;
    script.steps = [{ text: "Hi." }];

    await runCase(singleTurn("/", "Hello"), { config, budget: budget(), repeat: 0 });

    expect(console.log).toBe(original);
  });

  it("counts reasoning messages and history growth but never stores reasoning text", async () => {
    script.steps = [{ reasoning: "PRIVATE-CHAIN", text: "Answer." }];

    const [trace] = await runCase(singleTurn("/", "Hello"), { config, budget: budget(), repeat: 0 });

    expect(trace.reply).toBe("Answer.");
    expect(trace.runs[0].reasoningMessages).toBe(1);
    expect(trace.runs[0].requests).toEqual([]);
    expect(trace.messagesAdded).toBeGreaterThanOrEqual(3);
    expect(trace.bytesAdded).toBeGreaterThan(0);
    expect(JSON.stringify(trace)).not.toContain("PRIVATE-CHAIN");
  });
});
