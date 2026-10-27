import {
  conflictFitForSection,
  conflictsForCandidate,
} from "@/lib/assistant/check-plan-conflicts";
import { NOT_AVAILABLE_ON_SITE } from "@/lib/assistant/academic-facts";
import type { loadDiscoveryPool, loadReviewTexts } from "@/lib/assistant/data/discovery";
import { evaluateTimeRules, type RuleOutcome } from "@/lib/assistant/discovery/constraints";
import {
  compareRanked,
  rankingWeights,
  RANKING_NOTE,
  scoreSection,
  topicScore,
} from "@/lib/assistant/discovery/rank";
import { buildSectionCandidates, type SectionCandidate } from "@/lib/assistant/discovery/sections";
import { topicMatchLabels, matchTopic } from "@/lib/assistant/discovery/topic-match";
import {
  discoverCourseCandidatesInputSchema,
  discoverValidationIssues,
  type DiscoverToolFailure,
  discoverResultSchema,
  type DiscoverInput,
  type DiscoverResult,
  type DiscoveryFit,
} from "@/lib/assistant/discovery/schema";
import type { DiscoveryPool, PoolCourse, PoolInstructorRow, ReviewTextRow } from "@/lib/assistant/discovery/pool";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import { formatAcademicYear } from "@/lib/config/term-format";
import { MCP_TOOL_TIMEOUT_MS } from "@/lib/mcp/constants";
import { McpToolError } from "@/lib/mcp/errors";
import { analyzeTimetable, sectionLabel } from "@/lib/timetable/analysis";
import { detectScheduleConflicts } from "@/lib/timetable/conflicts";
import { normalizeCourseCode, type PlanSection } from "@/lib/timetable/schema";

export const MAX_DISCOVERY_RESULT_CHARS = 12_000;

const MAX_UNVERIFIED = 5;
const MAX_NO_LISTED = 10;
const MAX_OTHER_SECTIONS = 3;
const MAX_INSTRUCTORS = 3;
const REVIEW_CANDIDATE_LIMIT = 3;
const REVIEW_PWC_LIMIT = 6;
const MAX_EXCERPTS = 2;
const MAX_EXCERPT_CODE_POINTS = 120;

void NOT_AVAILABLE_ON_SITE;

export type DiscoveryDeps = {
  loadCatalogTerm: () => Promise<{ year: number; sem: number }>;
  loadPool: typeof loadDiscoveryPool;
  loadReviews: typeof loadReviewTexts;
};

export const defaultDiscoveryDeps: DiscoveryDeps = {
  loadCatalogTerm: async () => {
    const { getAppConfig } = await import("@/lib/config/app-config");
    const config = await getAppConfig();
    return { year: config.currentYear, sem: config.currentSem };
  },
  loadPool: (scope, term, abortSignal) =>
    import("@/lib/assistant/data/discovery").then((module) =>
      module.loadDiscoveryPool(scope, term, abortSignal),
    ),
  loadReviews: (pwcIds, abortSignal) =>
    import("@/lib/assistant/data/discovery").then((module) =>
      module.loadReviewTexts(pwcIds, abortSignal),
    ),
};

const DISCOVERY_NOTES = [
  "required.noClash checks each returned section against the saved plan separately; two individually compatible sections can still clash—use preview_timetable for a combined check.",
  "mutualClashes lists overlaps among the returned best sections only; it is not proof they all fit together.",
  "Ratings are past students' reports for this instructor's offering of the course.",
  "The site has no official exam format, prerequisite, seat or workload data.",
  "suggestedYear is a catalog hint only; it is not official registration eligibility.",
  "When examined.truncated is true, the search covered a bounded slice of matching courses—not every match was evaluated.",
] as const;

type TimetableInfo = {
  status: DiscoverResult["timetable"]["status"];
  plannerVersion?: string;
  planComplete?: boolean;
  planSections: PlanSection[];
  planCompleteForFit: boolean;
  checkClash: boolean;
};

type ScoredSection = {
  section: SectionCandidate;
  course: PoolCourse;
  fit: DiscoveryFit;
  clashes: DiscoverResult["candidates"][number]["clashes"];
  score: number;
  signals: ReturnType<typeof scoreSection>["signals"];
  matched: string[];
  tradeoffs: string[];
};

type BuiltCandidate = DiscoverResult["candidates"][number] & { planSection: PlanSection };

function parseCredits(value: string | null): number {
  if (value === null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function planCourseCodes(state: TimetableState): Set<string> {
  const codes = new Set<string>();
  if (state.status !== "ready") return codes;
  for (const section of state.plan.sections) {
    codes.add(normalizeCourseCode(section.courseCode));
  }
  return codes;
}

function courseInPlan(course: PoolCourse, planCodes: Set<string>): boolean {
  if (planCodes.has(course.courseCode)) return true;
  return course.aka.some((code) => planCodes.has(code));
}

function timetableInfo(state: TimetableState, catalogTerm: { year: number; sem: number }): TimetableInfo {
  if (state.status === "no_plan") {
    return {
      status: "no_plan",
      planSections: [],
      planCompleteForFit: false,
      checkClash: false,
    };
  }
  if (state.status === "loading" || state.status === "unavailable") {
    return {
      status: state.status,
      planSections: [],
      planCompleteForFit: false,
      checkClash: false,
    };
  }
  if (state.status !== "ready") {
    return {
      status: "no_plan",
      planSections: [],
      planCompleteForFit: false,
      checkClash: false,
    };
  }

  const analysis = analyzeTimetable(state.plan.sections);
  if (state.plan.year !== catalogTerm.year || state.plan.sem !== catalogTerm.sem) {
    return {
      status: "term_mismatch",
      plannerVersion: state.version,
      planComplete: analysis.complete,
      planSections: state.plan.sections,
      planCompleteForFit: false,
      checkClash: false,
    };
  }

  return {
    status: "ready",
    plannerVersion: state.version,
    planComplete: analysis.complete,
    planSections: state.plan.sections,
    planCompleteForFit: analysis.complete && !state.truncated,
    checkClash: true,
  };
}

function sectionFit(
  section: SectionCandidate,
  timetable: TimetableInfo,
): { fit: DiscoveryFit; clashes: ScoredSection["clashes"] } {
  if (!timetable.checkClash) {
    return { fit: "not_checked", clashes: undefined };
  }

  const conflicts = conflictsForCandidate(timetable.planSections, section.planSection);
  const fit = conflictFitForSection({
    complete: section.meetingsComplete,
    conflicts,
    planComplete: timetable.planCompleteForFit,
  });
  const clashes =
    conflicts.length > 0
      ? conflicts.map((entry) => ({ with: entry.with, day: entry.day, overlap: entry.overlap }))
      : undefined;
  return { fit, clashes };
}

function requiredRuleCounts() {
  return { startAfter: 0, endBefore: 0, avoidDays: 0, avoidWindows: 0, noClash: 0 };
}

function incrementRequiredExclusion(
  counts: ReturnType<typeof requiredRuleCounts>,
  rule: RuleOutcome["rule"],
) {
  if (rule === "fewerDays") return;
  counts[rule] += 1;
}

function collectRequiredMatched(outcomes: RuleOutcome[], matched: string[]) {
  for (const outcome of outcomes) {
    if (outcome.status === "met") matched.push(outcome.label);
  }
}

function instructorPayload(rows: PoolInstructorRow[]) {
  return rows.slice(0, MAX_INSTRUCTORS).map((row) => ({
    name: row.instructor,
    reviews: row.reviews,
    difficulty: row.difficulty > 0 ? row.difficulty : null,
    grade: row.grade > 0 ? row.grade : null,
    result: row.result > 0 ? row.result : null,
    sampleSize: row.reviews,
  }));
}

function normalizedSignalValue(signal: { adjusted: number; reviews: number } | undefined): number | undefined {
  if (!signal) return undefined;
  return signal.reviews === 0 ? 0.5 : (signal.adjusted - 1) / 4;
}

function buildSignals(signals: ScoredSection["signals"]): DiscoverResult["candidates"][number]["signals"] {
  return {
    ease: normalizedSignalValue(signals.ease),
    grade: normalizedSignalValue(signals.grade),
    rating: normalizedSignalValue(signals.rating),
    usefulness: signals.usefulness
      ? {
          mean: signals.usefulness.mean ?? signals.usefulness.adjusted,
          adjusted: signals.usefulness.adjusted,
          reviews: signals.usefulness.reviews,
        }
      : undefined,
  };
}

function totalReviews(rows: PoolInstructorRow[]): number {
  return rows.reduce((sum, row) => sum + row.reviews, 0);
}

function excerptAround(text: string, term: string): string | null {
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const index = lower.indexOf(needle);
  if (index === -1) return null;

  const chars = [...text];
  let start = index;
  let end = index + needle.length;
  while (start > 0 && end - start < MAX_EXCERPT_CODE_POINTS) {
    if (end - start >= MAX_EXCERPT_CODE_POINTS) break;
    if (start > 0) start -= 1;
    if (end < chars.length && end - start < MAX_EXCERPT_CODE_POINTS) end += 1;
  }
  while (end - start > MAX_EXCERPT_CODE_POINTS && start < index) start += 1;
  while (end - start > MAX_EXCERPT_CODE_POINTS && end > index + needle.length) end -= 1;
  return chars.slice(start, end).join("").trim();
}

function reviewEvidenceForCandidate(
  section: SectionCandidate,
  reviewTerms: string[],
  reviewRows: ReviewTextRow[],
): DiscoverResult["candidates"][number]["reviewEvidence"] {
  const texts = reviewRows.flatMap((row) =>
    section.instructors.some((instructor) => instructor.pwcId === row.pwcId) ? row.texts : [],
  );
  const mentions: Record<string, number> = {};
  const excerpts: string[] = [];

  for (const term of reviewTerms) {
    let count = 0;
    for (const text of texts) {
      const matches = text.toLowerCase().split(term.toLowerCase()).length - 1;
      if (matches > 0) count += matches;
      if (excerpts.length < MAX_EXCERPTS) {
        const excerpt = excerptAround(text, term);
        if (excerpt && !excerpts.includes(excerpt)) {
          excerpts.push(`[review] ${excerpt} [/review]`);
        }
      }
    }
    if (count > 0) mentions[term] = count;
  }

  return {
    read: texts.length,
    mentions,
    excerpts: excerpts.slice(0, MAX_EXCERPTS),
  };
}

function mutualClashes(candidates: BuiltCandidate[]): DiscoverResult["mutualClashes"] {
  const labels = new Set(candidates.map((candidate) => candidate.planSection.key));
  const pairs: [string, string][] = [];
  const seen = new Set<string>();

  for (const conflict of detectScheduleConflicts(candidates.map((candidate) => candidate.planSection))) {
    const left = conflict.a.key;
    const right = conflict.b.key;
    if (!labels.has(left) || !labels.has(right)) continue;
    const labelA = sectionLabel(conflict.a);
    const labelB = sectionLabel(conflict.b);
    const key = [labelA, labelB].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push([labelA, labelB].sort() as [string, string]);
  }

  pairs.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]));
  return pairs;
}

function withCompaction(result: DiscoverResult, dropped: readonly string[]): DiscoverResult {
  if (dropped.length === 0) return result;
  return {
    ...result,
    compaction: { truncated: true, dropped: [...new Set(dropped)] },
  };
}

function shrinkDiscoverResult(result: DiscoverResult): DiscoverResult {
  let next = result;
  const dropped: string[] = [];
  const over = (): boolean => JSON.stringify(next).length > MAX_DISCOVERY_RESULT_CHARS;

  if (!over()) return next;

  next = {
    ...next,
    candidates: next.candidates.map((candidate) => {
      if (!candidate.reviewEvidence) return candidate;
      return {
        ...candidate,
        reviewEvidence: {
          ...candidate.reviewEvidence,
          excerpts: candidate.reviewEvidence.excerpts.slice(0, 1),
        },
      };
    }),
  };
  dropped.push("reviewEvidence.excerpts");
  if (!over()) return withCompaction(next, dropped);

  next = {
    ...next,
    candidates: next.candidates.map((candidate) => ({
      ...candidate,
      reviewEvidence: candidate.reviewEvidence
        ? { ...candidate.reviewEvidence, excerpts: [] }
        : undefined,
      matched: [],
      tradeoffs: [],
      otherSections: candidate.otherSections.slice(0, 1),
    })),
  };
  dropped.push("matched", "tradeoffs");
  if (!over()) return withCompaction(next, dropped);

  next = {
    ...next,
    candidates: next.candidates.map((candidate) => ({
      ...candidate,
      titleEn: null,
      titleZh: null,
      otherSections: [],
      reviewEvidence: undefined,
    })),
    noListedSections: [],
  };
  dropped.push("titles", "otherSections", "noListedSections", "reviewEvidence");
  if (!over()) return withCompaction(next, dropped);

  let ranking = next.ranking;
  while (over() && ranking.length > 80) {
    ranking = ranking.slice(0, Math.max(80, Math.floor(ranking.length * 0.75)));
    next = { ...next, ranking };
  }
  dropped.push("ranking");
  if (!over()) return withCompaction(next, dropped);

  while (over() && next.candidates.length > 1) {
    next = { ...next, candidates: next.candidates.slice(0, -1) };
    dropped.push("candidates");
  }
  if (!over()) return withCompaction(next, dropped);

  next = {
    ...next,
    candidates: next.candidates.map((candidate) => ({
      ...candidate,
      instructors: candidate.instructors.slice(0, 1),
      meetings: candidate.meetings.slice(0, 2),
    })),
  };
  dropped.push("meetings", "instructors");
  if (!over()) return withCompaction(next, dropped);

  next = withCompaction(
    {
      ...next,
      candidates: next.candidates.map((candidate) => ({
        ...candidate,
        meetings: candidate.meetings.slice(0, 1),
      })),
    },
    [...dropped, "meetings_detail"],
  );
  if (!over()) return next;

  return withCompaction(
    {
      ...next,
      notes: next.notes.slice(0, 2),
    },
    [...dropped, "notes"],
  );
}

function noClashNotAppliedMessage(status: TimetableInfo["status"]): string {
  if (status === "no_plan") return "noClash: no saved timetable";
  if (status === "loading") return "noClash: timetable still loading";
  if (status === "unavailable") return "noClash: timetable unavailable";
  if (status === "term_mismatch") return "noClash: plan term does not match catalog term";
  return "noClash: timetable check did not run";
}

function evaluateSections(input: {
  pool: DiscoveryPool;
  input: DiscoverInput;
  timetable: TimetableInfo;
  examinedCourses: PoolCourse[];
  notApplied: string[];
  unverified: DiscoverResult["unverified"];
  excludedRequired: ReturnType<typeof requiredRuleCounts>;
}): Map<string, ScoredSection[]> {
  const courseByCode = new Map(input.examinedCourses.map((course) => [course.courseCode, course]));
  const allSections = buildSectionCandidates(input.pool).filter((section) =>
    courseByCode.has(section.courseCode),
  );

  const topics = input.input.scope.topics ?? [];
  const weights = rankingWeights({
    priorities: input.input.priorities ?? [],
    hasPreferred: Boolean(input.input.preferred),
    hasTopics: topics.length > 0,
  });

  const byCourse = new Map<string, ScoredSection[]>();
  let noClashNotApplied = false;

  for (const section of allSections) {
    const course = courseByCode.get(section.courseCode);
    if (!course) continue;

    const { fit, clashes } = sectionFit(section, input.timetable);
    const requiredOutcomes = evaluateTimeRules(
      section.meetings,
      section.meetingsComplete,
      input.input.required,
    );
    const preferredOutcomes = evaluateTimeRules(
      section.meetings,
      section.meetingsComplete,
      input.input.preferred,
      input.input.preferred?.fewerDays,
    );

    let eliminated = false;
    for (const outcome of requiredOutcomes) {
      if (outcome.status === "violated") {
        incrementRequiredExclusion(input.excludedRequired, outcome.rule);
        eliminated = true;
        break;
      }
    }

    if (!eliminated && input.input.required?.noClash) {
      if (fit === "confirmed_clash") {
        input.excludedRequired.noClash += 1;
        eliminated = true;
      } else if (fit === "incomplete") {
        if (input.unverified.length < MAX_UNVERIFIED) {
          input.unverified.push({
            courseCode: section.courseCode,
            section: section.section,
            reason: "clash_check_incomplete",
          });
        }
        eliminated = true;
      } else if (fit === "not_checked") {
        noClashNotApplied = true;
      }
    }

    if (!eliminated) {
      for (const outcome of requiredOutcomes) {
        if (outcome.status === "unknown") {
          if (input.unverified.length < MAX_UNVERIFIED) {
            input.unverified.push({
              courseCode: section.courseCode,
              section: section.section,
              reason: "meeting_times_incomplete",
            });
          }
          eliminated = true;
          break;
        }
      }
    }

    if (eliminated) continue;

    const clashWith = (clashes ?? []).map((entry) => entry.with);
    const scored = scoreSection({
      section,
      preferred: preferredOutcomes,
      topicScore: topicScore(course, topics),
      fit,
      clashWith,
      weights,
    });
    const matched = [...scored.matched];
    if (topics.length > 0) {
      matched.push(...topicMatchLabels(matchTopic(course, topics)));
    }
    collectRequiredMatched(requiredOutcomes, matched);

    const row: ScoredSection = {
      section,
      course,
      fit,
      clashes,
      score: scored.score,
      signals: scored.signals,
      matched,
      tradeoffs: scored.tradeoffs,
    };

    const existing = byCourse.get(section.courseCode) ?? [];
    existing.push(row);
    byCourse.set(section.courseCode, existing);
  }

  if (input.input.required?.noClash && noClashNotApplied) {
    input.notApplied.push(noClashNotAppliedMessage(input.timetable.status));
  }

  for (const rows of byCourse.values()) {
    rows.sort((left, right) =>
      compareRanked(
        {
          score: left.score,
          reviews: totalReviews(left.section.instructors),
          courseCode: left.section.courseCode,
          section: left.section.section,
        },
        {
          score: right.score,
          reviews: totalReviews(right.section.instructors),
          courseCode: right.section.courseCode,
          section: right.section.section,
        },
      ),
    );
  }

  return byCourse;
}

function buildCandidate(
  rank: number,
  best: ScoredSection,
  alternates: ScoredSection[],
): BuiltCandidate {
  return {
    rank,
    courseCode: best.section.courseCode,
    titleEn: best.course.titleEn,
    titleZh: best.course.titleZh,
    credits: parseCredits(best.course.credits),
    courseType: best.course.courseType ?? "",
    suggestedYear: best.course.suggestedYear,
    section: best.section.section,
    instructors: instructorPayload(best.section.instructors),
    meetings: best.section.meetingLines,
    meetingsComplete: best.section.meetingsComplete,
    fit: best.fit,
    clashes: best.clashes,
    matched: best.matched,
    tradeoffs: best.tradeoffs,
    signals: buildSignals(best.signals),
    score: best.score,
    otherSections: alternates.slice(0, MAX_OTHER_SECTIONS).map((row) => ({
      section: row.section.section,
      meetings: row.section.meetingLines,
      fit: row.fit,
      clashes: (row.clashes ?? []).length > 0 ? row.clashes : undefined,
    })),
    planSection: best.section.planSection,
  };
}

export async function runDiscoverCourseCandidates(
  state: TimetableState,
  args: unknown,
  deps: DiscoveryDeps = defaultDiscoveryDeps,
  signal?: AbortSignal,
): Promise<DiscoverResult | DiscoverToolFailure> {
  const parsed = discoverCourseCandidatesInputSchema.safeParse(args);
  if (!parsed.success) {
    return { error: "invalid_request", issues: discoverValidationIssues(parsed.error) };
  }

  let catalogTerm: { year: number; sem: number };
  try {
    catalogTerm = await deps.loadCatalogTerm();
  } catch {
    return { error: "temporarily_unavailable" };
  }

  const abortSignal = signal ?? AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS);

  let discoveryPool: DiscoveryPool;
  try {
    discoveryPool = await deps.loadPool(parsed.data.scope, catalogTerm, abortSignal);
  } catch (error) {
    if (error instanceof McpToolError && error.code === "temporarily_unavailable") {
      return { error: "temporarily_unavailable" };
    }
    throw error;
  }

  const timetable = timetableInfo(state, catalogTerm);
  const planCodes = planCourseCodes(state);
  const notApplied: string[] = [];
  const unverified: DiscoverResult["unverified"] = [];
  const excludedRequired = requiredRuleCounts();

  let alreadyInPlan = 0;
  const examinedCourses = discoveryPool.courses.filter((course) => {
    if (courseInPlan(course, planCodes)) {
      alreadyInPlan += 1;
      return false;
    }
    return true;
  });

  const allExaminedSections = buildSectionCandidates(discoveryPool).filter((section) =>
    examinedCourses.some((course) => course.courseCode === section.courseCode),
  );

  const sectionsByCourse = evaluateSections({
    pool: discoveryPool,
    input: parsed.data,
    timetable,
    examinedCourses,
    notApplied,
    unverified,
    excludedRequired,
  });

  const courseWinners: ScoredSection[] = [];
  for (const rows of sectionsByCourse.values()) {
    if (rows.length > 0) courseWinners.push(rows[0]!);
  }

  courseWinners.sort((left, right) =>
    compareRanked(
      {
        score: left.score,
        reviews: totalReviews(left.section.instructors),
        courseCode: left.section.courseCode,
        section: left.section.section,
      },
      {
        score: right.score,
        reviews: totalReviews(right.section.instructors),
        courseCode: right.section.courseCode,
        section: right.section.section,
      },
    ),
  );

  const limit = parsed.data.limit ?? 5;
  const winners = courseWinners.slice(0, limit);
  const candidates: BuiltCandidate[] = winners.map((best, index) => {
    const alternates = (sectionsByCourse.get(best.section.courseCode) ?? []).slice(1);
    return buildCandidate(index + 1, best, alternates);
  });

  const sectionsWithOffers = new Set(allExaminedSections.map((section) => section.courseCode));
  const noListedSections = examinedCourses
    .filter((course) => !sectionsWithOffers.has(course.courseCode))
    .map((course) => course.courseCode)
    .slice(0, MAX_NO_LISTED);

  if (parsed.data.reviewTerms?.length && candidates.length > 0) {
    const pwcIds: number[] = [];
    for (const winner of winners.slice(0, REVIEW_CANDIDATE_LIMIT)) {
      for (const instructor of winner.section.instructors) {
        if (!pwcIds.includes(instructor.pwcId)) pwcIds.push(instructor.pwcId);
        if (pwcIds.length >= REVIEW_PWC_LIMIT) break;
      }
      if (pwcIds.length >= REVIEW_PWC_LIMIT) break;
    }

    try {
      const reviewRows = await deps.loadReviews(pwcIds, abortSignal);
      for (let index = 0; index < Math.min(REVIEW_CANDIDATE_LIMIT, candidates.length); index += 1) {
        const built = candidates[index];
        if (!built) continue;
        const evidence = reviewEvidenceForCandidate(
          winners[index]!.section,
          parsed.data.reviewTerms,
          reviewRows,
        );
        candidates[index] = { ...built, reviewEvidence: evidence };
      }
    } catch (error) {
      if (error instanceof McpToolError) {
        notApplied.push("reviewTerms: reviews could not be read");
      } else {
        throw error;
      }
    }
  }

  const publicCandidates = candidates.map(({ planSection: _planSection, ...candidate }) => candidate);

  if (discoveryPool.offersTruncated) {
    notApplied.push("section offers capped; some sections may be missing from this search");
  }

  const requiredExcludedTotal = Object.values(excludedRequired).reduce((sum, count) => sum + count, 0);
  if (publicCandidates.length === 0 && requiredExcludedTotal > 0) {
    notApplied.push("required: no section satisfied all hard schedule rules");
  }

  const result: DiscoverResult = {
    status: "ok",
    term: {
      year: catalogTerm.year,
      sem: catalogTerm.sem,
      label: formatAcademicYear(catalogTerm.year, catalogTerm.sem),
    },
    timetable: {
      status: timetable.status,
      ...(timetable.plannerVersion ? { plannerVersion: timetable.plannerVersion } : {}),
      ...(timetable.planComplete !== undefined ? { planComplete: timetable.planComplete } : {}),
    },
    examined: {
      courses: examinedCourses.length,
      sections: allExaminedSections.length,
      totalMatchingCourses: discoveryPool.totalMatchingCourses,
      truncated: discoveryPool.truncated,
      ...(discoveryPool.topicFallback !== undefined ? { topicFallback: discoveryPool.topicFallback } : {}),
      ...(discoveryPool.topicTier !== undefined ? { topicTier: discoveryPool.topicTier } : {}),
    },
    excluded: {
      alreadyInPlan,
      excludedCodes: discoveryPool.excludedCodesMatched,
      noListedSections: noListedSections.length,
      required: excludedRequired,
    },
    notApplied,
    candidates: publicCandidates,
    unverified,
    noListedSections,
    mutualClashes: mutualClashes(candidates),
    ranking: RANKING_NOTE,
    notes: [
      ...DISCOVERY_NOTES,
      ...(discoveryPool.topicFallback
        ? [
            "Topic match was broadened to keyword-level hits because fewer than three courses matched the full topic phrases.",
          ]
        : []),
    ],
  };

  return shrinkDiscoverResult(discoverResultSchema.parse(result));
}
