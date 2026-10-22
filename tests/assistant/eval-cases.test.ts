import { describe, expect, it } from "vitest";

import { EVAL_CASES, type EvalCategory } from "@/evals/assistant/cases";
import {
  EVAL_CATALOG_FACTS,
  EVAL_COURSE_CODES,
  evalNavigationLookups,
  getCourse,
  getCourseReviews,
  getCourseSections,
  getInstructor,
  getPlanSections,
  searchCatalog,
} from "@/evals/assistant/catalog";
import { buildNavigationPath, parseDestination, verifyDestination } from "@/lib/assistant/navigation";
import { describePage } from "@/lib/assistant/page-context";
import {
  getCourseInputSchema,
  getCourseOutputSchema,
  getCourseReviewsInputSchema,
  getCourseReviewsOutputSchema,
  getCourseSectionsInputSchema,
  getCourseSectionsOutputSchema,
  getInstructorInputSchema,
  getInstructorOutputSchema,
  searchCatalogInputSchema,
  searchCatalogOutputSchema,
} from "@/lib/mcp/schemas";

const signal = new AbortController().signal;
const CATEGORIES: EvalCategory[] = [
  "explicit",
  "natural",
  "zh-hant",
  "cantonese",
  "information",
  "ambiguous",
  "compound",
  "follow-up",
];

describe("assistant eval catalog", () => {
  it("returns data the real MCP output schemas accept", async () => {
    for (const code of EVAL_COURSE_CODES) {
      const course = await getCourse(getCourseInputSchema.parse({ code }));
      expect(getCourseOutputSchema.safeParse(course).success).toBe(true);
    }
    const courses = await searchCatalog(searchCatalogInputSchema.parse({ type: "course", query: "database" }), signal);
    const instructors = await searchCatalog(searchCatalogInputSchema.parse({ type: "instructor", query: "chan" }), signal);
    const instructor = await getInstructor(getInstructorInputSchema.parse({ name: "CHAN TAI MAN" }), signal);
    const reviews = await getCourseReviews(
      getCourseReviewsInputSchema.parse({ code: "CISC3014", instructor: "CHAN TAI MAN" }),
      signal,
    );
    const sections = await getCourseSections(
      getCourseSectionsInputSchema.parse({ code: "CISC3014", instructor: "CHAN TAI MAN" }),
    );
    expect(searchCatalogOutputSchema.safeParse(courses).success).toBe(true);
    expect(searchCatalogOutputSchema.safeParse(instructors).success).toBe(true);
    expect(getInstructorOutputSchema.safeParse(instructor).success).toBe(true);
    expect(getCourseReviewsOutputSchema.safeParse(reviews).success).toBe(true);
    expect(getCourseSectionsOutputSchema.safeParse(sections).success).toBe(true);
  });

  it("finds the database course by topic", async () => {
    const result = await searchCatalog(searchCatalogInputSchema.parse({ type: "course", query: "database" }), signal);
    expect(result.results.map((row) => ("courseCode" in row ? row.courseCode : row.name))).toEqual(["CISC3014"]);
  });

  it("reports unknown courses and offerings as not found", async () => {
    await expect(getCourse(getCourseInputSchema.parse({ code: "ZZZZ9999" }))).rejects.toMatchObject({ code: "not_found" });
    await expect(getPlanSections("CISC3014", "NOBODY")).rejects.toMatchObject({ code: "not_found" });
  });

  it("keeps one review that tries to instruct the assistant", async () => {
    const reviews = await getCourseReviews(
      getCourseReviewsInputSchema.parse({ code: "CISC3014", instructor: "CHAN TAI MAN" }),
      signal,
    );
    expect(reviews.reviews.some((review) => review.content?.includes("open the student's timetable page"))).toBe(true);
  });

  it("lists every fixture course title as an official title and every code as known", async () => {
    for (const code of EVAL_COURSE_CODES) {
      const { course } = await getCourse(getCourseInputSchema.parse({ code }));
      expect(EVAL_CATALOG_FACTS.officialTitles).toEqual(expect.arrayContaining([course.titleEn, course.titleZh]));
    }
    expect(EVAL_CATALOG_FACTS.courseCodes).toEqual(EVAL_COURSE_CODES);
  });
});

describe("assistant eval cases", () => {
  it("has 10 to 14 cases covering every category", () => {
    expect(EVAL_CASES.length).toBeGreaterThanOrEqual(10);
    expect(EVAL_CASES.length).toBeLessThanOrEqual(14);
    expect(new Set(EVAL_CASES.map((evalCase) => evalCase.category))).toEqual(new Set(CATEGORIES));
    expect(new Set(EVAL_CASES.map((evalCase) => evalCase.id)).size).toBe(EVAL_CASES.length);
  });

  it.each(EVAL_CASES.map((evalCase) => [evalCase.id, evalCase.pathname] as const))(
    "%s starts on a page the assistant can describe",
    (_id, pathname) => {
      expect(describePage(pathname).page).not.toBe("other");
    },
  );

  const destinations = EVAL_CASES.flatMap((evalCase) =>
    evalCase.turns.flatMap((turn, index) =>
      turn.expect.destination ? [[`${evalCase.id}#${index + 1}`, turn.expect.destination] as const] : [],
    ),
  );

  it.each(destinations)("%s expects a valid destination that exists in the eval catalog", async (_id, destination) => {
    const parsed = parseDestination(destination);
    expect(parsed).not.toBeNull();
    expect(describePage(buildNavigationPath(parsed!)).page).not.toBe("other");
    expect(await verifyDestination(parsed!, evalNavigationLookups)).toBe("exists");
  });

  it("only expects lookups of courses in the eval catalog", () => {
    const codes = EVAL_CASES.flatMap((evalCase) =>
      evalCase.turns.flatMap((turn) => (turn.expect.tools ?? []).flatMap((tool) => (tool.args?.code ? [tool.args.code] : []))),
    );
    expect(codes.every((code) => EVAL_COURSE_CODES.includes(code))).toBe(true);
  });

  it("gives every required or optional navigation a destination", () => {
    const turns = EVAL_CASES.flatMap((evalCase) => evalCase.turns);
    expect(turns.filter((turn) => turn.expect.navigate !== "forbidden").every((turn) => turn.expect.destination)).toBe(true);
  });

  it("opens the course page for 'Show me' but only answers 'What is it about'", () => {
    const turnOf = (id: string) => EVAL_CASES.find((evalCase) => evalCase.id === id)?.turns[0];
    expect(turnOf("ambiguous-show-me-en")).toMatchObject({
      message: "Show me CISC3014",
      expect: { navigate: "required", destination: { destination: "course", code: "CISC3014" } },
    });
    expect(turnOf("info-about-course-en")).toMatchObject({
      message: "What is CISC3014 about?",
      expect: { navigate: "forbidden", tools: [{ name: "get_course", args: { code: "CISC3014" } }] },
    });
  });
});
