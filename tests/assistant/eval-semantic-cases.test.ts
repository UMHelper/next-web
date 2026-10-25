import { describe, expect, it, vi } from "vitest";

vi.mock("@copilotkit/runtime/v2", () => ({ defineTool: (config: unknown) => config }));
vi.mock("@/lib/mcp/data/search-catalog", () => ({ searchCatalog: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: vi.fn() }));
vi.mock("@/lib/mcp/data/get-instructor", () => ({ getInstructor: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: vi.fn() }));
vi.mock("@/lib/assistant/data/search-catalog", () => ({
  searchCatalogForAssistant: vi.fn(),
  countCoursesForAssistant: vi.fn(),
}));
vi.mock("@/lib/assistant/data/course-text", () => ({ getCourseText: vi.fn() }));
vi.mock("@/lib/assistant/data/instructor", () => ({ getInstructorForAssistant: vi.fn() }));
vi.mock("@/lib/assistant/data/reviews", () => ({ countCourseReviews: vi.fn() }));

import { EVAL_CASES } from "@/evals/assistant/cases";
import { evalNavigationLookups, getCourse } from "@/evals/assistant/catalog";
import { MULTILINGUAL_CASES } from "@/evals/assistant/multilingual-cases";
import {
  PICKED_REVIEWS,
  SEMANTIC_CASES,
  SEMANTIC_SCENARIOS,
  UNAVAILABLE_REVIEWS,
} from "@/evals/assistant/semantic-cases";
import { SMOKE_CASES } from "@/evals/assistant/smoke-cases";
import { SUITES } from "@/evals/assistant/suites";
import { TOKEN_CASES } from "@/evals/assistant/token-cases";
import { NAVIGATE_DESCRIPTION, buildNavigationPath, parseDestination, verifyDestination } from "@/lib/assistant/navigation";
import { describePage } from "@/lib/assistant/page-context";
import { ASSISTANT_PROMPT } from "@/lib/assistant/prompt";
import type { GetCourseInput } from "@/lib/mcp/schemas";

import { modelText } from "./model-text";

const GROUP: Record<string, string> = {
  en: "en",
  "zh-hant": "zh-hant",
  yue: "yue",
  ko: "ko",
  ja: "ja",
  "mixed-yue-en": "mixed",
  "mixed-ko-en": "mixed",
};
const REPLY: Record<string, string> = {
  en: "english",
  "zh-hant": "chinese",
  yue: "chinese",
  "mixed-yue-en": "chinese",
  ko: "korean",
  "mixed-ko-en": "korean",
  ja: "japanese",
};
const turns = SEMANTIC_CASES.flatMap((evalCase) => evalCase.turns);
const ofScenario = (scenario: string) => SEMANTIC_CASES.filter((evalCase) => evalCase.id === `sa-${scenario}-${evalCase.language}`);
const instructorsOf = async (code: string) =>
  (await getCourse({ code, page: 1 } as GetCourseInput)).instructors.map((entry) => entry.name);

describe("semantic-action holdout suite", () => {
  it("asks every scenario once in each of six language groups", () => {
    expect(SEMANTIC_CASES).toHaveLength(SEMANTIC_SCENARIOS.length * 6);
    for (const scenario of SEMANTIC_SCENARIOS) {
      expect(ofScenario(scenario).map((evalCase) => GROUP[evalCase.language!]).sort()).toEqual(
        ["en", "ja", "ko", "mixed", "yue", "zh-hant"],
      );
    }
    expect(new Set(SEMANTIC_CASES.map((evalCase) => evalCase.id)).size).toBe(SEMANTIC_CASES.length);
    expect(SUITES.semantic).toBe(SEMANTIC_CASES);
  });

  it("expects replies in the student's language", () => {
    for (const evalCase of SEMANTIC_CASES) {
      for (const turn of evalCase.turns) expect(turn.expect.replyLanguage).toBe(REPLY[evalCase.language!]);
    }
  });

  it("keeps every message, fixture name and course code out of what the model is given", () => {
    const text = modelText();
    for (const turn of turns) expect(text).not.toContain(turn.message);
    for (const name of ["WONG KA KI", "LI MEI"]) expect(text).not.toContain(name);
    const instructions = `${ASSISTANT_PROMPT}\n${NAVIGATE_DESCRIPTION}`;
    expect(instructions).not.toMatch(/\b[A-Z]{4}\d{4}\b/);
    expect(instructions).not.toMatch(/[\p{Script=Han}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u);
  });

  it("does not reuse or contain the wording of the earlier suites", () => {
    const earlier = [...EVAL_CASES, ...MULTILINGUAL_CASES, ...TOKEN_CASES, ...SMOKE_CASES].flatMap((evalCase) =>
      evalCase.turns.map((turn) => turn.message),
    );
    for (const turn of turns) {
      for (const message of earlier) {
        expect(message.includes(turn.message) || turn.message.includes(message), `${turn.message} / ${message}`).toBe(false);
      }
    }
  });

  it("starts on pages the assistant can describe", () => {
    for (const evalCase of SEMANTIC_CASES) expect(describePage(evalCase.pathname).page).not.toBe("other");
  });

  it("expects destinations that exist and names the page type of every page request", async () => {
    for (const turn of turns) {
      if (turn.expect.navigate !== "forbidden") expect(turn.expect.requestedPage).toBeDefined();
      if (!turn.expect.destination) continue;
      const parsed = parseDestination(turn.expect.destination);
      expect(parsed).not.toBeNull();
      expect(turn.expect.requestedPage).toBe(parsed!.destination);
      expect(describePage(buildNavigationPath(parsed!)).page).not.toBe("other");
      expect(await verifyDestination(parsed!, evalNavigationLookups)).toBe("exists");
    }
  });

  it("lists every instructor of the course as the options of a clarify turn", async () => {
    const clarify = turns.filter((turn) => turn.expect.navigate === "clarify");
    expect(clarify).toHaveLength(12);
    for (const turn of clarify) {
      const code = turn.expect.tools?.find((tool) => tool.name === "get_course")?.args?.code;
      expect(code).toBeDefined();
      const instructors = await instructorsOf(code!);
      expect(instructors.length).toBeGreaterThan(1);
      expect([...turn.expect.options!].sort()).toEqual([...instructors].sort());
      expect(turn.expect.requestedPage).toBe("reviews");
    }
  });

  it("uses a course with exactly one instructor for the one-instructor cases", async () => {
    for (const { turns: [turn] } of ofScenario("reviews-one")) {
      const code = turn.expect.destination!.code;
      expect(turn.expect.tools).toEqual([{ name: "get_course", args: { code } }]);
      expect(await instructorsOf(code)).toEqual([turn.expect.destination!.instructor]);
    }
  });

  it("follows a clarify turn with the student's choice on the same course page", () => {
    for (const evalCase of ofScenario("here-choose")) {
      expect(evalCase.pathname).toBe("/course/CISC2001");
      expect(evalCase.turns.map((turn) => turn.expect.navigate)).toEqual(["clarify", "required"]);
      expect(evalCase.turns[1].expect.destination).toEqual(PICKED_REVIEWS);
    }
  });

  it("uses pages the site cannot open for the unavailable cases", async () => {
    for (const { turns: [turn] } of ofScenario("unavailable")) {
      expect(turn.expect.navigate).toBe("unavailable");
      const target =
        turn.expect.requestedPage === "reviews"
          ? UNAVAILABLE_REVIEWS
          : { destination: "course" as const, code: turn.expect.studentCodes![0] };
      expect(await verifyDestination(target, evalNavigationLookups)).toBe("missing");
    }
  });
});
