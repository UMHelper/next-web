import { z } from "zod/v4";

import { SITE_URL } from "@/lib/site";

/** JSON Schema dialects the MCP SDK may request for a tool schema. */
export type McpJsonSchemaTarget = "draft-2020-12" | "draft-07" | "openapi-3.0" | (object & string);

export type McpValidationResult<TOutput> =
  | { readonly value: TOutput; readonly issues?: undefined }
  | {
      readonly issues: ReadonlyArray<{
        readonly message: string;
        readonly path?: ReadonlyArray<PropertyKey>;
      }>;
    };

/**
 * Structural view of the `StandardSchemaWithJSON` contract that
 * `@modelcontextprotocol/server` requires from `registerTool` schemas: JSON
 * Schema conversion for `tools/list` plus synchronous validation for
 * `tools/call`.
 */
export type McpSchema<TInput, TOutput> = {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly types?: { readonly input: TInput; readonly output: TOutput };
    readonly validate: (value: unknown) => McpValidationResult<TOutput>;
    readonly jsonSchema: {
      readonly input: (options: { target: McpJsonSchemaTarget }) => Record<string, unknown>;
      readonly output: (options: { target: McpJsonSchemaTarget }) => Record<string, unknown>;
    };
  };
};

/**
 * Bridge a `zod/v4` schema onto the MCP server's schema contract.
 *
 * The `zod/v4` build bundled with this repository's zod 3.25.x predates zod's
 * `~standard.jsonSchema` bridge (added in zod 4.2), while the MCP server package
 * declares that property in its `registerTool` signature. Rather than duplicating
 * the schemas or casting them away, this adapter supplies the missing converter
 * from this repository's own `z.toJSONSchema`, so validation, defaults, trimming
 * and the advertised JSON Schema all still come from the same zod schema.
 *
 * zod 4.0 only emits `draft-7` / `draft-2020-12`; every other requested dialect
 * (the MCP SDK itself always asks for `draft-2020-12`) falls back to 2020-12.
 */
function toZodJsonSchemaTarget(target: McpJsonSchemaTarget): "draft-7" | "draft-2020-12" {
  return target === "draft-07" ? "draft-7" : "draft-2020-12";
}

export function toMcpSchema<TSchema extends z.ZodType>(
  schema: TSchema,
): McpSchema<z.input<TSchema>, z.output<TSchema>> {
  return {
    "~standard": {
      version: 1,
      vendor: "umhelper",
      validate: (value) => {
        const result = schema.safeParse(value);
        if (result.success) return { value: result.data };
        return {
          issues: result.error.issues.map((issue) => ({
            message: issue.message,
            path: issue.path,
          })),
        };
      },
      jsonSchema: {
        input: (options) =>
          z.toJSONSchema(schema, {
            target: toZodJsonSchemaTarget(options.target),
            io: "input",
          }) as Record<string, unknown>,
        output: (options) =>
          z.toJSONSchema(schema, {
            target: toZodJsonSchemaTarget(options.target),
            io: "output",
          }) as Record<string, unknown>,
      },
    },
  };
}

/**
 * Shared MCP tool annotations.
 *
 * Every tool in the public plugin is a read-only projection of public UMHelper
 * data: it never mutates state, never issues side effects outside the service,
 * and only reaches the fixed UMHelper/Supabase backend (closed world).
 */
export const mcpReadOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

/**
 * Reference URLs are built exclusively by `lib/site.ts` helpers and must stay on
 * the production origin. Enforcing the prefix in the output schema turns a
 * projection mistake into a server error instead of a leaked/hand-built link.
 */
const referenceUrlSchema = z.string().startsWith(`${SITE_URL}/`);

// ---------------------------------------------------------------------------
// search_catalog
// ---------------------------------------------------------------------------

/**
 * Optional free-text filter: trimmed, length-bounded, and blank input normalized
 * to `undefined` (per §6.1 a blank value counts as absent, so another filter can
 * still satisfy the "at least one" rule).
 *
 * `trim()` and `max()` are native zod checks, so the bound is reflected in the
 * JSON Schema advertised through `tools/list` — not only enforced at parse time.
 */
const optionalFilter = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .transform((value): string | undefined => (value.length === 0 ? undefined : value))
    .optional();

export const searchCatalogTypeSchema = z.enum(["course", "instructor"]);

export const searchCatalogInputSchema = z
  .object({
    type: searchCatalogTypeSchema.describe(
      "Search the course catalog (`course`) or the instructor catalog (`instructor`).",
    ),
    query: optionalFilter(80).describe(
      "Course code, course title or instructor name to search for. Optional, but at least one of query, faculty or department is required.",
    ),
    faculty: optionalFilter(40).describe(
      "Faculty / offering unit filter, for example `FBA`. Optional.",
    ),
    department: optionalFilter(80).describe(
      "Department / offering department filter, for example `ACCT`. Optional.",
    ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(10)
      .describe("Maximum number of results to return (1..10). Defaults to 10."),
  })
  .refine(
    (input) =>
      input.query !== undefined || input.faculty !== undefined || input.department !== undefined,
    { message: "provide at least one of query, faculty or department" },
  );

export type SearchCatalogInput = z.infer<typeof searchCatalogInputSchema>;

export const catalogCourseSchema = z.object({
  courseCode: z.string().min(1),
  titleEn: z.string().nullable(),
  titleZh: z.string().nullable(),
  faculty: z.string().nullable(),
  department: z.string().nullable(),
  credits: z.string().nullable(),
  isOffered: z.boolean(),
  url: referenceUrlSchema,
});

export const catalogInstructorSchema = z.object({
  name: z.string().min(1),
  courseCount: z.number().int().nonnegative(),
  url: referenceUrlSchema,
});

export type CatalogCourse = z.infer<typeof catalogCourseSchema>;
export type CatalogInstructor = z.infer<typeof catalogInstructorSchema>;

export const searchCatalogOutputSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("course"), results: z.array(catalogCourseSchema) }),
  z.object({ type: z.literal("instructor"), results: z.array(catalogInstructorSchema) }),
]);

export type SearchCatalogOutput = z.infer<typeof searchCatalogOutputSchema>;

/**
 * MCP-facing views of the `search_catalog` schemas (see {@link toMcpSchema}).
 * The raw zod schemas above remain the source of truth for validation.
 */
export const mcpSearchCatalogInputSchema = toMcpSchema(searchCatalogInputSchema);
export const mcpSearchCatalogOutputSchema = toMcpSchema(searchCatalogOutputSchema);

// ---------------------------------------------------------------------------
// get_course
// ---------------------------------------------------------------------------

/**
 * Course codes are normalized before they reach the data layer: trimmed and
 * upper-cased, per §6. `.min`/`.max` are native checks applied to the trimmed
 * value, so the advertised JSON Schema carries `minLength`/`maxLength`.
 */
export const getCourseInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .describe("Course code to look up, for example ACCT1000.")
    .transform((value) => value.toUpperCase()),
});

export type GetCourseInput = z.infer<typeof getCourseInputSchema>;

export const courseDetailSchema = z.object({
  courseCode: z.string().min(1),
  titleEn: z.string().nullable(),
  titleZh: z.string().nullable(),
  credits: z.string().nullable(),
  faculty: z.string().nullable(),
  department: z.string().nullable(),
  programLevel: z.string().nullable(),
  suggestedYear: z.string().nullable(),
  medium: z.string().nullable(),
  gradingSystem: z.string().nullable(),
  courseType: z.string().nullable(),
  duration: z.string().nullable(),
  description: z.string().nullable(),
  isOffered: z.boolean(),
  url: referenceUrlSchema,
});

export type CourseDetail = z.infer<typeof courseDetailSchema>;

export const courseInstructorSummarySchema = z.object({
  name: z.string().min(1),
  commentCount: z.number().int().nonnegative(),
  result: z.number().nullable(),
  attendance: z.number().nullable(),
  grade: z.number().nullable(),
  difficulty: z.number().nullable(),
  reward: z.number().nullable(),
  isOffered: z.boolean(),
  reviewUrl: referenceUrlSchema,
});

export type CourseInstructorSummary = z.infer<typeof courseInstructorSummarySchema>;

export const getCourseOutputSchema = z.object({
  course: courseDetailSchema,
  instructors: z.array(courseInstructorSummarySchema).max(20),
});

export type GetCourseOutput = z.infer<typeof getCourseOutputSchema>;

// ---------------------------------------------------------------------------
// get_instructor
// ---------------------------------------------------------------------------

/**
 * Instructor names are trimmed and internal whitespace runs are collapsed to a
 * single space before the exact `prof_id` lookup, per §6.
 */
export const getInstructorInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("Instructor display name to look up, for example CHAN TAI MAN.")
    .transform((value) => value.replace(/\s+/g, " ").toUpperCase()),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(20)
    .describe("Maximum number of courses to return (1..20). Defaults to 20."),
});

export type GetInstructorInput = z.infer<typeof getInstructorInputSchema>;

export const instructorCourseSummarySchema = z.object({
  courseCode: z.string().min(1),
  commentCount: z.number().int().nonnegative(),
  result: z.number().nullable(),
  attendance: z.number().nullable(),
  grade: z.number().nullable(),
  difficulty: z.number().nullable(),
  reward: z.number().nullable(),
  isOffered: z.boolean(),
  courseUrl: referenceUrlSchema,
  reviewUrl: referenceUrlSchema,
});

export type InstructorCourseSummary = z.infer<typeof instructorCourseSummarySchema>;

export const getInstructorOutputSchema = z.object({
  name: z.string().min(1),
  courses: z.array(instructorCourseSummarySchema).max(20),
});

export type GetInstructorOutput = z.infer<typeof getInstructorOutputSchema>;

/**
 * MCP-facing views of the course/instructor schemas (see {@link toMcpSchema}).
 * Every tool schema must pass through this bridge: the bundled zod/v4 build has
 * no `~standard.jsonSchema` that `registerTool` requires.
 */
export const mcpGetCourseInputSchema = toMcpSchema(getCourseInputSchema);
export const mcpGetCourseOutputSchema = toMcpSchema(getCourseOutputSchema);
export const mcpGetInstructorInputSchema = toMcpSchema(getInstructorInputSchema);
export const mcpGetInstructorOutputSchema = toMcpSchema(getInstructorOutputSchema);

// ---------------------------------------------------------------------------
// get_course_reviews
// ---------------------------------------------------------------------------

/**
 * `page` stays 1-based in the public contract: the adapter converts it to the
 * zero-based `target_page` the controlled RPC expects. `limit` is the caller's
 * page size and is pushed into `target_page_size` instead of using the site's
 * fixed-20 helper.
 */
export const getCourseReviewsInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .describe("Course code whose public reviews should be read, for example ACCT1000.")
    .transform((value) => value.toUpperCase()),
  instructor: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("Instructor display name recorded for that course, for example CHAN TAI MAN.")
    .transform((value) => value.replace(/\s+/g, " ").toUpperCase()),
  page: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(1)
    .describe("1-based review page to read (1..50). Defaults to 1."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Maximum number of top-level reviews on the page (1..10). Defaults to 5."),
});

export type GetCourseReviewsInput = z.infer<typeof getCourseReviewsInputSchema>;

/**
 * One public top-level review. The adapter rebuilds this object field by field;
 * comment ids, the internal mapping id, author identity, `verify_account`,
 * `hidden`, image URLs, avatar seeds, vote history and emoji details are never
 * projected.
 */
export const courseReviewSchema = z.object({
  publishedAt: z.string().nullable(),
  content: z.string().nullable(),
  contentEn: z.string().nullable(),
  result: z.number().nullable(),
  upvotes: z.number().int().nonnegative(),
  downvotes: z.number().int().nonnegative(),
  verified: z.boolean(),
  url: referenceUrlSchema,
});

export type CourseReview = z.infer<typeof courseReviewSchema>;

export const getCourseReviewsOutputSchema = z.object({
  courseCode: z.string().min(1),
  instructor: z.string().min(1),
  page: z.number().int().min(1).max(50),
  url: referenceUrlSchema,
  reviews: z.array(courseReviewSchema).max(10),
});

export type GetCourseReviewsOutput = z.infer<typeof getCourseReviewsOutputSchema>;

export const mcpGetCourseReviewsInputSchema = toMcpSchema(getCourseReviewsInputSchema);
export const mcpGetCourseReviewsOutputSchema = toMcpSchema(getCourseReviewsOutputSchema);

// ---------------------------------------------------------------------------
// get_course_sections
// ---------------------------------------------------------------------------

export const getCourseSectionsInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .describe("Course code whose sections should be read, for example ACCT1000.")
    .transform((value) => value.toUpperCase()),
  instructor: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe("Instructor display name recorded for that course, for example CHAN TAI MAN.")
    .transform((value) => value.replace(/\s+/g, " ").toUpperCase()),
});

export type GetCourseSectionsInput = z.infer<typeof getCourseSectionsInputSchema>;

/**
 * One class meeting projected from the catalog schedule. `weekday` replaces the
 * catalog's `date` column and the raw `time` range is split by the deterministic
 * parser in `lib/mcp/data/get-course-sections.ts`.
 */
export const sectionScheduleSchema = z.object({
  weekday: z.string().min(1),
  startTime: z.string().min(1),
  endTime: z.string().min(1),
  location: z.string().nullable(),
});

export type SectionSchedule = z.infer<typeof sectionScheduleSchema>;

export const courseSectionSchema = z.object({
  section: z.string().min(1),
  schedules: z.array(sectionScheduleSchema).max(20),
  courseUrl: referenceUrlSchema,
});

export type CourseSection = z.infer<typeof courseSectionSchema>;

export const getCourseSectionsOutputSchema = z.object({
  courseCode: z.string().min(1),
  instructor: z.string().min(1),
  courseUrl: referenceUrlSchema,
  sections: z.array(courseSectionSchema).max(20),
});

export type GetCourseSectionsOutput = z.infer<typeof getCourseSectionsOutputSchema>;

export const mcpGetCourseSectionsInputSchema = toMcpSchema(getCourseSectionsInputSchema);
export const mcpGetCourseSectionsOutputSchema = toMcpSchema(getCourseSectionsOutputSchema);
