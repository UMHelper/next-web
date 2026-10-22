import { describe, expect, it, vi } from "vitest";
import type { z } from "zod";

vi.mock("@copilotkit/runtime/v2", () => ({ defineTool: (config: unknown) => config }));
vi.mock("@/lib/mcp/data/search-catalog", () => ({ searchCatalog: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course", () => ({ getCourse: vi.fn() }));
vi.mock("@/lib/mcp/data/get-instructor", () => ({ getInstructor: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-reviews", () => ({ getCourseReviews: vi.fn() }));
vi.mock("@/lib/mcp/data/get-course-sections", () => ({ getCourseSections: vi.fn() }));

import { buildNavigationPath, parseDestination } from "@/lib/assistant/navigation";
import { describePage } from "@/lib/assistant/page-context";
import { checkPlanConflictsParameters } from "@/lib/assistant/check-plan-conflicts";
import { createAssistantTools } from "@/lib/assistant/tools";
import {
  getCourseInputSchema,
  getCourseReviewsInputSchema,
  getCourseSectionsInputSchema,
  getInstructorInputSchema,
  searchCatalogInputSchema,
} from "@/lib/mcp/schemas";

import { ASSISTANT_GOLDEN_QUESTIONS } from "../fixtures/assistant-golden-questions";

const MCP_INPUT_SCHEMAS = {
  search_catalog: searchCatalogInputSchema,
  get_course: getCourseInputSchema,
  get_instructor: getInstructorInputSchema,
  get_course_reviews: getCourseReviewsInputSchema,
  get_course_sections: getCourseSectionsInputSchema,
};

const tools = createAssistantTools() as unknown as Array<{ name: string; parameters: z.ZodTypeAny }>;

const NAVIGATE_PAGE_KIND = {
  course: "course",
  professor: "instructor",
  reviews: "course_reviews",
  catalog: "catalog",
  timetable: "timetable",
} as const;

describe("assistant golden questions", () => {
  it("has about ten questions", () => {
    expect(ASSISTANT_GOLDEN_QUESTIONS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(ASSISTANT_GOLDEN_QUESTIONS.map((question) => [question.id, question] as const))(
    "%s: the expected tool input is accepted end to end",
    (_id, question) => {
      const expected = question.expected;
      if (expected.kind === "no_tool") return;

      if (expected.kind === "frontend_tool") {
        if (expected.tool === "check_plan_conflicts") {
          expect(checkPlanConflictsParameters.safeParse(expected.input).success).toBe(true);
          return;
        }
        const parsed = parseDestination(expected.input);
        expect(parsed).not.toBeNull();
        expect(describePage(buildNavigationPath(parsed!)).page).toBe(NAVIGATE_PAGE_KIND[parsed!.destination]);
        return;
      }

      const tool = tools.find((entry) => entry.name === expected.tool);
      expect(tool?.parameters.safeParse(expected.input).success).toBe(true);
      expect(MCP_INPUT_SCHEMAS[expected.tool].safeParse(expected.input).success).toBe(true);
    },
  );

  it.each(
    ASSISTANT_GOLDEN_QUESTIONS.filter((question) => question.pathname).map(
      (question) => [question.id, question] as const,
    ),
  )("%s: the page context supplies every identifier the expected tool input uses", (_id, question) => {
    const page = describePage(question.pathname!);
    const expected = question.expected;
    if (expected.kind === "no_tool") {
      expect(page).toEqual({ page: "home" });
      return;
    }
    if (expected.kind === "frontend_tool" && expected.tool === "navigate") {
      return;
    }
    const identifiers = Object.values(page);
    for (const value of Object.values(expected.input)) {
      expect(identifiers).toContain(value);
    }
  });
});
