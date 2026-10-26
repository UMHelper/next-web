import { z } from "zod";

import type { ConflictFit } from "@/lib/assistant/check-plan-conflicts";

export const DISCOVER_COURSE_CANDIDATES_TOOL_NAME = "discover_course_candidates";

export const discoveryWeekdays = ["MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
export type DiscoveryWeekday = (typeof discoveryWeekdays)[number];

export const discoveryPriorities = [
  "easier",
  "higher_grades",
  "better_rated",
  "more_useful",
  "topic_match",
] as const;
export type DiscoveryPriority = (typeof discoveryPriorities)[number];

export type DiscoveryFit = ConflictFit | "not_checked";

const CODE_PREFIX_RE = /^[A-Za-z]{2,4}\d{0,3}$/i;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;

const courseCodeField = z
  .string()
  .trim()
  .min(1)
  .max(20)
  .transform((value) => value.toUpperCase());

const weekdaySchema = z.enum(discoveryWeekdays);

const avoidWindowParameters = z.object({
  start: z.string().describe("Window start (HH:MM)."),
  end: z.string().describe("Window end (HH:MM); must be after start."),
  days: z
    .array(weekdaySchema)
    .optional()
    .describe("When set, the window applies only on these weekdays; otherwise every meeting day."),
});

const timeRuleFields = {
  startAfter: z
    .string()
    .optional()
    .describe(
      "HH:MM — every meeting must start at or after this time. In required: hard elimination; in preferred: soft ranking only.",
    ),
  endBefore: z
    .string()
    .optional()
    .describe(
      "HH:MM — every meeting must end at or before this time. In required: hard elimination; in preferred: soft ranking only.",
    ),
  avoidDays: z
    .array(weekdaySchema)
    .optional()
    .describe(
      "Weekdays the section must not meet on. In required: hard elimination; in preferred: soft ranking only.",
    ),
  avoidWindows: z
    .array(avoidWindowParameters)
    .max(3)
    .optional()
    .describe(
      "Time ranges to avoid (strict overlap; touching is allowed). In required: hard elimination; in preferred: soft ranking only.",
    ),
};

type TimeRulesShape = {
  startAfter?: string;
  endBefore?: string;
  avoidDays?: DiscoveryWeekday[];
  avoidWindows?: { start: string; end: string; days?: DiscoveryWeekday[] }[];
};

export type TimeRules = TimeRulesShape;

function parseHhMm(value: string): string | null {
  const match = TIME_RE.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

function validateTimeRules(
  rules: TimeRulesShape | undefined,
  path: (string | number)[],
  ctx: z.RefinementCtx,
) {
  if (!rules) return;

  const startAfter = rules.startAfter !== undefined ? parseHhMm(rules.startAfter) : undefined;
  if (rules.startAfter !== undefined && startAfter === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "startAfter"],
      message: "invalid time",
    });
  }

  const endBefore = rules.endBefore !== undefined ? parseHhMm(rules.endBefore) : undefined;
  if (rules.endBefore !== undefined && endBefore === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "endBefore"],
      message: "invalid time",
    });
  }

  if (startAfter && endBefore && timeToMinutesSafe(endBefore) <= timeToMinutesSafe(startAfter)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: [...path, "endBefore"],
      message: "endBefore must be after startAfter",
    });
  }

  for (let index = 0; index < (rules.avoidWindows?.length ?? 0); index += 1) {
    const window = rules.avoidWindows![index]!;
    const start = parseHhMm(window.start);
    const end = parseHhMm(window.end);
    if (start === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "avoidWindows", index, "start"],
        message: "invalid time",
      });
    }
    if (end === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "avoidWindows", index, "end"],
        message: "invalid time",
      });
    }
    if (start && end && timeToMinutesSafe(end) <= timeToMinutesSafe(start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, "avoidWindows", index],
        message: "window end must be after start",
      });
    }
  }
}

function timeToMinutesSafe(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function hasScopeAnchor(scope: {
  courseType?: string;
  codePrefix?: string;
  faculty?: string;
  department?: string;
  topics?: string[];
  maxSuggestedYear?: number;
}) {
  return Boolean(
    scope.courseType ||
      scope.codePrefix ||
      scope.faculty ||
      scope.department ||
      scope.topics?.length ||
      scope.maxSuggestedYear !== undefined,
  );
}

const discoveryScopeParameters = z.object({
  courseType: z
    .enum(["GE", "Non-GE"])
    .optional()
    .describe("Limit to GE or Non-GE courses (scope anchor)."),
  codePrefix: z
    .string()
    .trim()
    .optional()
    .describe("Course code prefix such as GEST or CISC1 (scope anchor)."),
  faculty: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .optional()
    .describe("Offering unit code such as FST (scope anchor)."),
  department: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .optional()
    .describe("Offering department code such as CIS (scope anchor)."),
  topics: z
    .array(z.string().trim().min(2).max(40))
    .max(5)
    .optional()
    .describe("Up to five topic phrases OR-matched on titles, descriptions and ILOs (scope anchor)."),
  maxSuggestedYear: z
    .number()
    .int()
    .min(1)
    .max(5)
    .optional()
    .describe("Keep courses with suggested year of study at most this value (scope anchor)."),
  credits: z
    .number()
    .min(0)
    .max(12)
    .optional()
    .describe("Exact credit value filter; not a scope anchor on its own."),
  excludeCodes: z
    .array(courseCodeField)
    .max(20)
    .optional()
    .describe("Course codes to exclude from results."),
});

export const discoverCourseCandidatesParameters = z.object({
  scope: discoveryScopeParameters.describe(
    "Course pool definition; include at least one anchor among courseType, codePrefix, faculty, department, topics, or maxSuggestedYear.",
  ),
  required: z
    .object({
      ...timeRuleFields,
      noClash: z
        .boolean()
        .optional()
        .describe(
          "required: only what the student says must happen — when true, eliminate sections that clash with the saved timetable.",
        ),
    })
    .optional()
    .describe(
      "Hard constraints: only what the student says must or cannot happen; violations eliminate sections.",
    ),
  preferred: z
    .object({
      ...timeRuleFields,
      fewerDays: z
        .boolean()
        .optional()
        .describe(
          "preferred: soft preference — favor sections that meet on at most two distinct weekdays.",
        ),
    })
    .optional()
    .describe("Soft schedule preferences used for ranking and trade-off explanations."),
  priorities: z
    .array(z.enum(discoveryPriorities))
    .max(4)
    .optional()
    .describe("Ordered ranking signals (no duplicates); defaults to better_rated when omitted."),
  reviewTerms: z
    .array(z.string().trim().min(2).max(30))
    .max(3)
    .optional()
    .describe("Terms to search in student reviews for the top candidates (optional enrichment)."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(8)
    .default(5)
    .describe("Maximum distinct courses to return (default 5)."),
});

export const discoverCourseCandidatesInputSchema = discoverCourseCandidatesParameters.superRefine(
  (value, ctx) => {
    if (!hasScopeAnchor(value.scope)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope"],
        message: "scope needs at least one anchor",
      });
    }

    if (value.scope.codePrefix !== undefined && !CODE_PREFIX_RE.test(value.scope.codePrefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["scope", "codePrefix"],
        message: "invalid code prefix",
      });
    }

    validateTimeRules(value.required, ["required"], ctx);
    validateTimeRules(value.preferred, ["preferred"], ctx);

    if (value.priorities) {
      const seen = new Set<string>();
      for (let index = 0; index < value.priorities.length; index += 1) {
        const item = value.priorities[index]!;
        if (seen.has(item)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["priorities", index],
            message: "duplicate priority",
          });
        }
        seen.add(item);
      }
    }
  },
).transform((value) => ({
  ...value,
  scope: {
    ...value.scope,
    codePrefix: value.scope.codePrefix?.toUpperCase(),
  },
}));

export type DiscoverInput = z.infer<typeof discoverCourseCandidatesInputSchema>;
export type DiscoveryScope = DiscoverInput["scope"];

const discoveryFitSchema = z.enum([
  "verified_no_clash",
  "confirmed_clash",
  "incomplete",
  "not_checked",
]);

const instructorSignalSchema = z
  .object({
    name: z.string(),
    reviews: z.number(),
    difficulty: z.number().nullable(),
    grade: z.number().nullable(),
    result: z.number().nullable(),
    sampleSize: z.number(),
  })
  .strict();

const candidateSchema = z
  .object({
    rank: z.number().int(),
    courseCode: z.string(),
    titleEn: z.string().nullable(),
    titleZh: z.string().nullable(),
    credits: z.number(),
    courseType: z.string(),
    suggestedYear: z.number().nullable(),
    section: z.string(),
    instructors: z.array(instructorSignalSchema).max(3),
    meetings: z.array(z.string()),
    meetingsComplete: z.boolean(),
    fit: discoveryFitSchema,
    clashes: z
      .array(
        z
          .object({
            with: z.string(),
            day: weekdaySchema,
            overlap: z.string(),
          })
          .strict(),
      )
      .optional(),
    matched: z.array(z.string()),
    tradeoffs: z.array(z.string()),
    signals: z
      .object({
        ease: z.number().optional(),
        grade: z.number().optional(),
        rating: z.number().optional(),
        usefulness: z
          .object({
            mean: z.number(),
            adjusted: z.number(),
            reviews: z.number(),
          })
          .strict()
          .optional(),
      })
      .strict(),
    score: z.number(),
    otherSections: z.array(
      z
        .object({
          section: z.string(),
          meetings: z.string(),
          fit: discoveryFitSchema,
        })
        .strict(),
    ),
    reviewEvidence: z
      .object({
        read: z.number(),
        mentions: z.record(z.string(), z.number()),
        excerpts: z.array(z.string()),
      })
      .strict()
      .optional(),
  })
  .strict();

export const discoverResultSchema = z
  .object({
    status: z.literal("ok"),
    term: z.object({ year: z.number(), sem: z.number(), label: z.string() }).strict(),
    timetable: z
      .object({
        status: z.enum(["ready", "no_plan", "loading", "unavailable", "term_mismatch"]),
        plannerVersion: z.string().optional(),
        planComplete: z.boolean().optional(),
      })
      .strict(),
    examined: z
      .object({
        courses: z.number(),
        sections: z.number(),
        totalMatchingCourses: z.number(),
        truncated: z.boolean(),
      })
      .strict(),
    excluded: z
      .object({
        alreadyInPlan: z.number(),
        excludedCodes: z.number(),
        noListedSections: z.number(),
        required: z
          .object({
            startAfter: z.number(),
            endBefore: z.number(),
            avoidDays: z.number(),
            avoidWindows: z.number(),
            noClash: z.number(),
          })
          .strict(),
      })
      .strict(),
    notApplied: z.array(z.string()),
    candidates: z.array(candidateSchema),
    unverified: z.array(
      z
        .object({
          courseCode: z.string(),
          section: z.string(),
          reason: z.enum(["meeting_times_incomplete", "clash_check_incomplete"]),
        })
        .strict(),
    ),
    noListedSections: z.array(z.string()),
    mutualClashes: z.array(z.tuple([z.string(), z.string()])),
    ranking: z.string(),
    notes: z.array(z.string()),
  })
  .strict();

export type DiscoverResult = z.infer<typeof discoverResultSchema>;

const toolFailureEnvelope = z.object({ error: z.enum(["invalid_request", "temporarily_unavailable"]) }).strict();

export function parseDiscoverResult(content: unknown): DiscoverResult | null {
  let parsed: unknown = content;
  if (typeof content === "string") {
    try {
      parsed = JSON.parse(content);
    } catch {
      return null;
    }
  }
  if (toolFailureEnvelope.safeParse(parsed).success) return null;
  const result = discoverResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
