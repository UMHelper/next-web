import { z } from "zod";

/**
 * Assistant-only tool contracts.
 *
 * The public MCP schemas in `lib/mcp/schemas.ts` stay narrower: these schemas
 * add filters, sorting, count-only tools and course text/ILO reads without
 * changing what external MCP clients see.
 */

const optionalText = (maxLength: number) => z.string().trim().max(maxLength).optional();

const page = z.number().int().min(1).max(50).default(1);
const courseLimit = z.number().int().min(1).max(50).default(20);

export const courseSearchFields = ["code_title", "content", "all"] as const;
export const courseSortFields = ["code", "title", "credits", "suggestedYear", "isOffered"] as const;

const courseFilters = {
  query: optionalText(80).describe(
    "Free-text term. With searchIn=code_title it matches the course code and either title; with content it matches titles, descriptions and ILOs.",
  ),
  faculty: optionalText(40).describe("Offering unit code, for example FBA."),
  department: optionalText(80).describe("Offering department code, for example ACCT."),
  credits: optionalText(20).describe("Exact credit value, for example 3."),
  courseType: optionalText(80).describe("Exact course type, for example Compulsory or Elective."),
  programLevel: optionalText(40).describe("Exact programme level, for example UG or PG."),
  suggestedYear: z.number().int().min(0).max(10).optional().describe("Exact suggested year of study."),
  offeredOnly: z.boolean().optional().describe("When true, keep only courses offered in the current term."),
};

/**
 * Searching by course code/title/faculty/department is open to both result
 * types. Course-only filters are validated below so an instructor search cannot
 * silently ignore them.
 */
export const searchCatalogToolParametersSchema = z.object({
  type: z.enum(["course", "instructor"]),
  ...courseFilters,
  searchIn: z
    .enum(courseSearchFields)
    .default("code_title")
    .describe(
      "Course searches only: code_title matches code and titles; content matches titles, descriptions and ILOs; all matches code, titles, descriptions and ILOs.",
    ),
  sortBy: z.enum(courseSortFields).default("code").describe("Course searches only: sort key."),
  sortOrder: z.enum(["asc", "desc"]).default("asc").describe("Course searches only: sort direction."),
  limit: courseLimit,
  page,
});

export const searchCatalogToolInputSchema = searchCatalogToolParametersSchema
  .superRefine((value, ctx) => {
    if (value.type !== "instructor") return;

    const courseOnly =
      value.credits !== undefined ||
      value.courseType !== undefined ||
      value.programLevel !== undefined ||
      value.suggestedYear !== undefined ||
      value.offeredOnly !== undefined ||
      value.searchIn !== "code_title" ||
      value.sortBy !== "code" ||
      value.sortOrder !== "asc";

    if (courseOnly) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "course-only filters require type=course",
      });
    }
  })
  .refine(
    (value) =>
      Boolean(
        value.query ||
          value.faculty ||
          value.department ||
          value.credits ||
          value.courseType ||
          value.programLevel ||
          value.suggestedYear !== undefined ||
          value.offeredOnly === true,
      ),
    { message: "provide at least one search term or filter" },
  );

export type SearchCatalogToolInput = z.infer<typeof searchCatalogToolInputSchema>;

export const countCoursesParametersSchema = z.object({
  ...courseFilters,
  searchIn: z.enum(courseSearchFields).default("code_title"),
});

export const countCoursesInputSchema = countCoursesParametersSchema
  .refine(
    (value) =>
      Boolean(
        value.query ||
          value.faculty ||
          value.department ||
          value.credits ||
          value.courseType ||
          value.programLevel ||
          value.suggestedYear !== undefined ||
          value.offeredOnly === true,
      ),
    { message: "provide at least one search term or filter" },
  );

export type CountCoursesInput = z.infer<typeof countCoursesInputSchema>;

const courseCode = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((value) => value.toUpperCase())
  .describe("Course code, for example ACCT1000.");

export const getCourseTextInputSchema = z.object({ code: courseCode });

export type GetCourseTextInput = z.infer<typeof getCourseTextInputSchema>;

export const courseTextOutputSchema = z.object({
  courseCode: z.string().min(1),
  titleEn: z.string().nullable(),
  titleZh: z.string().nullable(),
  text: z.string().nullable(),
  truncated: z.boolean(),
  url: z.string().url(),
});

export type CourseTextOutput = z.infer<typeof courseTextOutputSchema>;

export const getInstructorToolInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((value) => value.replace(/\s+/g, " ").toUpperCase())
    .describe("Instructor name in English exactly as the tools returned it."),
  minResult: z.number().min(0).max(5).optional().describe("Keep courses whose average result is at least this value."),
  maxDifficulty: z.number().min(0).max(5).optional().describe("Keep courses whose difficulty is at most this value."),
  minCommentCount: z.number().int().min(0).optional().describe("Keep courses with at least this many reviews."),
  offeredOnly: z.boolean().optional().describe("When true, keep only courses offered in the current term."),
  sortBy: z
    .enum(["code", "result", "difficulty", "commentCount"])
    .default("code")
    .describe("Sort key for the instructor's courses."),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  limit: z.number().int().min(1).max(20).default(20),
  page,
});

export type GetInstructorToolInput = z.infer<typeof getInstructorToolInputSchema>;

export const getCourseReviewsToolInputSchema = z.object({
  code: courseCode,
  instructor: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((value) => value.replace(/\s+/g, " ").toUpperCase())
    .describe("Instructor display name recorded for that course."),
  limit: z.number().int().min(1).max(10).default(10).describe("Reviews per page (1..10). Defaults to 10."),
  page,
});

export type GetCourseReviewsToolInput = z.infer<typeof getCourseReviewsToolInputSchema>;

export const countReviewsInputSchema = z.object({
  code: courseCode,
  instructor: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((value) => value.replace(/\s+/g, " ").toUpperCase())
    .describe("Instructor display name recorded for that course."),
});

export type CountReviewsInput = z.infer<typeof countReviewsInputSchema>;

export const countOutputSchema = z.object({
  totalCount: z.number().int().nonnegative(),
});

export type CountOutput = z.infer<typeof countOutputSchema>;
