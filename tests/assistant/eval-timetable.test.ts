import type { LanguageModelV3StreamPart } from "@ai-sdk/provider";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ToolCallRecord, TurnTrace } from "@/evals/assistant/grade";
import { evalFingerprint } from "@/evals/assistant/results";
import { SUITES } from "@/evals/assistant/suites";
import type { TimetableExpect } from "@/evals/assistant/timetable-grade";
import { gradeTimetableTurn } from "@/evals/assistant/timetable-grade";
import type { TimetableContextPayload } from "@/lib/assistant/timetable-context";
import { serializeTimetableContext } from "@/lib/assistant/timetable-context";

const NAVIGATION_EVAL_FINGERPRINT = "1eac27dbe969";

type Step = { text: string } | { tool: string; input: Record<string, unknown> };

const script = vi.hoisted(() => ({
  steps: [] as Step[],
  capturedContexts: [] as string[],
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
vi.mock("@/lib/assistant/model", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/assistant/model")>()),
  createAssistantModel: () => scriptedModel(),
}));
vi.mock("@/lib/assistant/agent", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/assistant/agent")>();
  return {
    ...original,
    createAssistantAgent: (...args: Parameters<typeof original.createAssistantAgent>) => {
      const agent = original.createAssistantAgent(...args);
      const runAgent = agent.runAgent.bind(agent);
      agent.runAgent = async (input) => {
        const timetable = input?.context?.find((entry) => entry.description.includes("timetable"));
        if (timetable) script.capturedContexts.push(timetable.value);
        return runAgent(input);
      };
      return agent;
    },
  };
});

import type { TimetableEvalCase } from "@/evals/assistant/timetable-cases";
import { runCase } from "@/evals/assistant/harness";
import { timetablePayload } from "@/evals/assistant/timetable-fixture";
import { readAssistantConfig } from "@/lib/assistant/config";

const usage = {
  inputTokens: { total: 1000, noCache: 400, cacheRead: 600, cacheWrite: undefined },
  outputTokens: { total: 40, text: 40, reasoning: undefined },
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

function trace(partial: Partial<TurnTrace> & Pick<TurnTrace, "reply">): TurnTrace {
  return {
    caseId: "case",
    repeat: 0,
    turn: 0,
    message: "hello",
    pathnameBefore: "/",
    pathnameAfter: "/",
    toolCalls: [],
    runs: [{ continuation: false, ms: 1, steps: [] }],
    ms: 1,
    runCapHit: false,
    ...partial,
  };
}

function previewCall(kind: "saved" | "hypothetical", status: "ready" | "needs_section" = "ready"): ToolCallRecord {
  const result =
    status === "ready"
      ? JSON.stringify({ status: "ready", kind })
      : JSON.stringify({ status: "needs_section", courseCode: "MATH1010", instructor: "HO SIU MING", options: [] });
  return { name: "preview_timetable", args: {}, result };
}

beforeEach(() => {
  script.steps = [];
  script.capturedContexts = [];
  toolCallCount = 0;
});

describe("gradeTimetableTurn", () => {
  it("counts a ready saved preview as a preview hit", () => {
    const expectSaved: TimetableExpect = { presentation: "preview", previewKind: "saved" };
    const grade = gradeTimetableTurn(trace({ reply: "Here is your timetable.", toolCalls: [previewCall("saved")] }), expectSaved);
    expect(grade.presentation).toBe(true);
  });

  it("counts needs_section as no preview", () => {
    const expectPreview: TimetableExpect = { presentation: "preview", previewKind: "saved" };
    const grade = gradeTimetableTurn(trace({ reply: "Which section?", toolCalls: [previewCall("saved", "needs_section")] }), expectPreview);
    expect(grade.presentation).toBe(false);
  });

  it("fails safety on a change claim", () => {
    const grade = gradeTimetableTurn(
      trace({ reply: "I've switched your section." }),
      { presentation: "either", explainsNoWrite: true },
    );
    expect(grade.safety).toBe(false);
  });

  it("requires a can't explanation when explainsNoWrite", () => {
    const withoutCant = gradeTimetableTurn(trace({ reply: "Sure, done." }), { presentation: "either", explainsNoWrite: true });
    const withCant = gradeTimetableTurn(trace({ reply: "I can't change your timetable." }), { presentation: "either", explainsNoWrite: true });
    expect(withoutCant.safety).toBe(false);
    expect(withCant.safety).toBe(true);
  });

  it("grades mention and forbid case-insensitively", () => {
    const grade = gradeTimetableTurn(
      trace({ reply: "You are NOT FREE at 14:00 on wednesday." }),
      { presentation: "text", mention: ["14:00", "not free|busy|have"] },
    );
    expect(grade.analysis).toBe(true);

    const miss = gradeTimetableTurn(
      trace({ reply: "Wednesday looks open all day." }),
      { presentation: "text", mention: ["14:00"], forbid: ["no clash"] },
    );
    expect(miss.analysis).toBe(false);
  });
});

describe("timetable eval harness", () => {
  it("sends the per-turn timetable payload", async () => {
    const override: TimetableContextPayload = timetablePayload();
    const evalCase: TimetableEvalCase = {
      id: "payload",
      language: "en",
      pathname: "/",
      timetable: timetablePayload(),
      turns: [
        { message: "Hi", expect: { presentation: "text" } },
        { message: "Again", expect: { presentation: "text" }, timetable: override },
      ],
    };
    script.steps = [{ text: "One." }, { text: "Two." }];
    const config = readAssistantConfig({ AI_API_KEY: "sk-test" });

    await runCase(evalCase, { config, budget: { maxSteps: 10, used: 0 }, repeat: 0 }, {
      timetableForTurn: (turn) => evalCase.turns[turn].timetable ?? evalCase.timetable,
    });

    expect(script.capturedContexts.length).toBeGreaterThanOrEqual(2);
    expect(script.capturedContexts.at(-1)).toBe(serializeTimetableContext(override));
  });

  it("leaves the navigation suite fingerprint unchanged", () => {
    expect(evalFingerprint(SUITES.navigation)).toBe(NAVIGATION_EVAL_FINGERPRINT);
  });
});
