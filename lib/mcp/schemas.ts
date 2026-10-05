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
