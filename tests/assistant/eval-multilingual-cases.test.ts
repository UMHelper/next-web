import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { describe, expect, it, vi } from "vitest";

vi.mock("@copilotkit/runtime/v2", () => ({ defineTool: (config: unknown) => config }));
vi.mock("@/lib/mcp/data/search-catalog", () => ({ searchCatalog: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: vi.fn() }));
vi.mock("@/lib/mcp/data/get-instructor", () => ({ getInstructor: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: vi.fn() }));

import { EVAL_COURSE_CODES, evalNavigationLookups } from "@/evals/assistant/catalog";
import { MULTILINGUAL_CASES } from "@/evals/assistant/multilingual-cases";
import { SMOKE_CASES } from "@/evals/assistant/smoke-cases";
import { SUITES } from "@/evals/assistant/suites";
import { CHECK_PLAN_CONFLICTS_DESCRIPTION, checkPlanConflictsParameters } from "@/lib/assistant/check-plan-conflicts";
import {
  NAVIGATE_DESCRIPTION,
  buildNavigationPath,
  navigateParameters,
  parseDestination,
  verifyDestination,
} from "@/lib/assistant/navigation";
import { PAGE_CONTEXT_DESCRIPTION, describePage } from "@/lib/assistant/page-context";
import { PLAN_CONTEXT_DESCRIPTION } from "@/lib/assistant/plan-summary";
import { ASSISTANT_PROMPT } from "@/lib/assistant/prompt";
import { createAssistantTools } from "@/lib/assistant/tools";

const turns = MULTILINGUAL_CASES.flatMap((evalCase) => evalCase.turns);
const tools = createAssistantTools();
const MODEL_TEXT = [
  ASSISTANT_PROMPT,
  NAVIGATE_DESCRIPTION,
  PAGE_CONTEXT_DESCRIPTION,
  PLAN_CONTEXT_DESCRIPTION,
  CHECK_PLAN_CONFLICTS_DESCRIPTION,
  ...tools.map((tool) => tool.description ?? ""),
  ...[...tools.map((tool) => tool.parameters), navigateParameters, checkPlanConflictsParameters].map((schema) =>
    JSON.stringify(zodToJsonSchema(schema as ZodTypeAny)),
  ),
].join("\n");
// The production instructor schema uses this name as its example; tool definitions are held constant in Phase 2.
const KNOWN_SCHEMA_EXAMPLES = ["CHAN TAI MAN"];
const FIXTURE_NAMES = ["WONG KA KI", "LI MEI", "CHAN TAI MAN"];

describe("phase 2 multilingual pilot", () => {
  it("covers every language and behaviour the brief lists, in 12 to 14 cases", () => {
    expect(MULTILINGUAL_CASES.length).toBeGreaterThanOrEqual(12);
    expect(MULTILINGUAL_CASES.length).toBeLessThanOrEqual(14);
    expect(new Set(MULTILINGUAL_CASES.map((evalCase) => evalCase.language))).toEqual(
      new Set(["en", "zh-hant", "yue", "ko", "ja", "mixed-yue-en", "mixed-ko-en"]),
    );
    expect(new Set(MULTILINGUAL_CASES.map((evalCase) => evalCase.category))).toEqual(
      new Set([
        "natural",
        "information",
        "current-page",
        "missing-parameter",
        "comparison",
        "compound",
        "ambiguous",
        "unavailable",
        "injection",
      ]),
    );
    expect(MULTILINGUAL_CASES.every((evalCase) => evalCase.id.startsWith("ml-") && evalCase.intent)).toBe(true);
    expect(new Set(MULTILINGUAL_CASES.map((evalCase) => evalCase.id)).size).toBe(MULTILINGUAL_CASES.length);
  });

  it("asks the same goals in several languages", () => {
    const languagesOf = (intent: string) =>
      new Set(MULTILINGUAL_CASES.filter((evalCase) => evalCase.intent === intent).map((evalCase) => evalCase.language));
    expect(languagesOf("course-page")).toEqual(new Set(["ko", "ja", "en"]));
    expect(languagesOf("course-info")).toEqual(new Set(["ja", "mixed-yue-en"]));
    expect(languagesOf("reviews-page")).toEqual(new Set(["ja", "mixed-ko-en"]));
  });

  it("keeps Korean, Japanese, case wording and fixture data out of everything the model is given", () => {
    expect(MODEL_TEXT).not.toMatch(/[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}]/u);
    for (const turn of [...turns, ...SMOKE_CASES.flatMap((evalCase) => evalCase.turns)]) {
      expect(MODEL_TEXT).not.toContain(turn.message);
    }
    for (const code of [...EVAL_COURSE_CODES, "CISC9999"]) expect(MODEL_TEXT).not.toContain(code);
    for (const name of FIXTURE_NAMES.filter((name) => !KNOWN_SCHEMA_EXAMPLES.includes(name))) {
      expect(MODEL_TEXT).not.toContain(name);
    }
  });

  it("starts on pages the assistant can describe", () => {
    for (const evalCase of MULTILINGUAL_CASES) expect(describePage(evalCase.pathname).page).not.toBe("other");
  });

  it("expects destinations that exist and lookups the catalog can answer", async () => {
    for (const turn of turns) {
      if (turn.expect.destination) {
        const parsed = parseDestination(turn.expect.destination);
        expect(parsed).not.toBeNull();
        expect(describePage(buildNavigationPath(parsed!)).page).not.toBe("other");
        expect(await verifyDestination(parsed!, evalNavigationLookups)).toBe("exists");
      }
      for (const tool of turn.expect.tools ?? []) {
        if (tool.args?.code) expect(EVAL_COURSE_CODES).toContain(tool.args.code);
      }
    }
  });

  it("only lists course codes the catalog does not have as student codes", async () => {
    const unavailable = turns.filter((turn) => turn.expect.navigate === "unavailable");
    expect(unavailable.length).toBeGreaterThan(0);
    for (const turn of unavailable) {
      for (const code of turn.expect.studentCodes ?? []) {
        expect(EVAL_COURSE_CODES).not.toContain(code);
        expect(await verifyDestination({ destination: "course", code }, evalNavigationLookups)).toBe("missing");
      }
    }
  });

  it("requires a lookup before landing on a reviews page", () => {
    for (const turn of turns.filter((entry) => entry.expect.destination?.destination === "reviews")) {
      expect(turn.expect.tools).toEqual([{ name: "get_course", args: { code: "CISC3014" } }]);
    }
  });
});

describe("eval suites", () => {
  it("registers every suite once", () => {
    expect(Object.keys(SUITES).sort()).toEqual(["multilingual", "navigation", "smoke", "tokens"]);
    expect(SUITES.multilingual).toBe(MULTILINGUAL_CASES);
    expect(SUITES.smoke).toBe(SMOKE_CASES);
  });

  it("smoke-tests a server tool, a navigate follow-up run and a later turn", () => {
    expect(SMOKE_CASES).toHaveLength(1);
    const [first, second] = SMOKE_CASES[0].turns;
    expect(first.expect).toMatchObject({ navigate: "required", tools: [{ name: "search_catalog" }] });
    expect(second.expect).toMatchObject({ navigate: "forbidden", tools: [{ name: "get_course" }] });
  });
});
