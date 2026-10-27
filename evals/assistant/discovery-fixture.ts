import type { DiscoveryScope } from "@/lib/assistant/discovery/schema";
import type { DiscoveryPool, PoolCourse, PoolInstructorRow, PoolOffer, ReviewTextRow } from "@/lib/assistant/discovery/pool";
import { buildTimetableContextPayload } from "@/lib/assistant/timetable-context";
import type { TimetableContextPayload } from "@/lib/assistant/timetable-context";
import { McpToolError } from "@/lib/mcp/errors";
import type {
  GetCourseInput,
  GetCourseOutput,
  GetCourseReviewsInput,
  GetCourseReviewsOutput,
  GetCourseSectionsInput,
  GetCourseSectionsOutput,
  GetInstructorInput,
  GetInstructorOutput,
  SearchCatalogOutput,
} from "@/lib/mcp/schemas";
import type {
  CountCoursesInput,
  CountReviewsInput,
  CourseTextOutput,
  GetInstructorToolInput,
  SearchCatalogToolInput,
} from "@/lib/assistant/tool-schemas";
import { absoluteUrl, buildCoursePath, buildReviewPath } from "@/lib/site";
import { plannerCurrentTerm } from "@/lib/timetable/current-term";
import type { LocalPlan } from "@/lib/timetable/store";
import { normalizePlanSection } from "@/lib/timetable/schema";
import { filterCoursesByTopicMatch, matchTopic } from "@/lib/assistant/discovery/topic-match";
import { offer, pool, poolCourse, pwcRow } from "@/tests/fixtures/discovery-pool";
import { plannerState } from "@/tests/helpers/planner-state";

import type { CatalogFacts } from "./grade";

type FixtureInstructor = {
  name: string;
  commentCount: number;
  result: number;
  grade: number;
  difficulty: number;
  reward: number;
  reviews: Array<{ publishedAt: string; content: string; result: number }>;
};

type FixtureCourse = {
  course: PoolCourse;
  description: string;
  ilo: string;
  instructors: FixtureInstructor[];
  sections: Array<{ section: string; pwcId: number; meetings: string[] }>;
};

const TERM = { year: 2026, sem: 1 };
const MAX_POOL_COURSES = 150;

function sanitizeSearchTerm(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function course(
  partial: Partial<PoolCourse> & Pick<PoolCourse, "courseCode">,
  description: string,
  ilo: string,
  instructors: FixtureInstructor[],
  sections: Array<{ section: string; meetings: string[] }>,
  startPwcId: number,
): FixtureCourse {
  const base = poolCourse(partial);
  return {
    course: base,
    description,
    ilo,
    instructors,
    sections: sections.map((entry, index) => ({
      section: entry.section,
      meetings: entry.meetings,
      pwcId: startPwcId + index,
    })),
  };
}

const prof = (
  name: string,
  difficulty: number,
  reviews: FixtureInstructor["reviews"] = [],
): FixtureInstructor => ({
  name,
  commentCount: reviews.length || 8,
  result: 4,
  grade: 3.5,
  difficulty,
  reward: 3.5,
  reviews,
});

const FIXTURE_COURSES: FixtureCourse[] = [
  course(
    { courseCode: "GEST1001", department: "GEST", courseType: "GE", suggestedYear: 1, titleEn: "Thinking and Expression" },
    "Foundations of academic writing and discussion.",
    "Express ideas clearly in writing and speech.",
    [prof("CHAN MEI LING", 3.2), prof("LEE WAI MAN", 4.1)],
    [
      { section: "001", meetings: ["MON 09:00-10:15 E11", "WED 09:00-10:15 E11"] },
      { section: "002", meetings: ["TUE 14:00-15:15 E11", "THU 14:00-15:15 E11"] },
    ],
    1001,
  ),
  course(
    { courseCode: "GEST1002", department: "GEST", courseType: "GE", suggestedYear: 1, titleEn: "Quantitative Reasoning" },
    "Numbers in everyday decisions.",
    "Apply basic statistics to real problems.",
    [prof("HO SIU MING", 3.8)],
    [{ section: "001", meetings: ["TUE 11:00-12:15 E11"] }],
    1010,
  ),
  course(
    { courseCode: "GEST1003", department: "GEST", courseType: "GE", suggestedYear: 1, titleEn: "Ethics and Society" },
    "Moral reasoning in modern life.",
    "Evaluate ethical arguments.",
    [prof("WONG KA YEE", 4.0)],
    [{ section: "001", meetings: ["WED 15:00-16:15 E11"] }],
    1015,
  ),
  course(
    { courseCode: "GEST1004", department: "GEST", courseType: "GE", suggestedYear: 2, titleEn: "Science and Technology" },
    "Technology in society with weekly readings.",
    "Discuss science policy trade-offs.",
    [
      prof("LAM TAI MAN", 3.0, [
        { publishedAt: "2026-03-01", content: "One midterm and a final; readings are heavy.", result: 3 },
      ]),
    ],
    [{ section: "001", meetings: ["MON 11:00-12:15 E11"] }],
    1020,
  ),
  course(
    { courseCode: "GEST1005", department: "GEST", courseType: "GE", suggestedYear: 1, titleEn: "Arts and Culture" },
    "Creative arts across cultures.",
    "Interpret works in context.",
    [prof("CHEUNG WAI", 4.2)],
    [
      { section: "001", meetings: ["FRI 11:00-12:15 E11"] },
      { section: "002", meetings: ["TUE 15:00-16:15 E11"] },
    ],
    1025,
  ),
  course(
    { courseCode: "GEST1006", department: "GEST", courseType: "GE", suggestedYear: 1, titleEn: "Science in Daily Life" },
    "Everyday science for non-majors.",
    "Explain natural phenomena.",
    [prof("WONG SIU MING", 4.3)],
    [
      { section: "001", meetings: ["MON 13:30-14:45 E11", "THU 13:30-14:45 E11"] },
      { section: "002", meetings: ["TUE 11:30-12:45 E11", "THU 11:30-12:45 E11"] },
    ],
    1030,
  ),
  course(
    { courseCode: "GEST1007", department: "GEST", courseType: "GE", suggestedYear: 2, titleEn: "Global Issues" },
    "Contemporary global challenges.",
    "Connect local and global issues.",
    [prof("XU MEI", 3.6)],
    [{ section: "001", meetings: ["WED 11:00-12:15 E11"] }],
    1040,
  ),
  course(
    { courseCode: "GEST1008", department: "GEST", courseType: "GE", suggestedYear: 1, titleEn: "Healthy Living" },
    "Wellness and public health basics.",
    "Apply health evidence to choices.",
    [prof("NG KA CHUN", 4.0)],
    [{ section: "001", meetings: ["THU 15:00-16:15 E11"] }],
    1045,
  ),
  course(
    { courseCode: "GEGA1000", department: "GEGA", courseType: "GE", suggestedYear: 1, titleEn: "Macao and Chinese History" },
    "Macao history and Chinese cultural heritage.",
    "Describe Macao's role in Chinese history.",
    [prof("CHAN TAI MAN", 3.4)],
    [
      { section: "007", meetings: ["MON 13:00-14:15 E11", "THU 13:00-14:15 E11"] },
      { section: "008", meetings: ["TUE 10:00-11:15 E11"] },
    ],
    2001,
  ),
  course(
    { courseCode: "GEGA1001", department: "GEGA", courseType: "GE", suggestedYear: 1, titleEn: "Chinese Civilization" },
    "Survey of Chinese history and culture.",
    "Identify major periods of Chinese history.",
    [prof("LEE MEI LING", 3.9)],
    [{ section: "001", meetings: ["MON 11:00-12:15 E11"] }],
    2010,
  ),
  course(
    { courseCode: "GEGA1002", department: "GEGA", courseType: "GE", suggestedYear: 2, titleEn: "Modern China" },
    "Twentieth-century Chinese history.",
    "Analyze primary sources on modern China.",
    [prof("CHEUNG HO", 3.5)],
    [{ section: "001", meetings: ["WED 14:00-15:15 E11"] }],
    2015,
  ),
  course(
    { courseCode: "GESB1010", department: "GESB", courseType: "GE", suggestedYear: 1, titleEn: "Business Ethics" },
    "Ethics for business decisions.",
    "Apply ethical frameworks to cases.",
    [prof("MAK WAI", 3.7)],
    [{ section: "001", meetings: ["TUE 10:00-11:15 E11"] }],
    3001,
  ),
  course(
    { courseCode: "GESB1011", department: "GESB", courseType: "GE", suggestedYear: 1, titleEn: "Economics in Life" },
    "Microeconomics for general students.",
    "Explain supply and demand.",
    [prof("TANG MEI", 3.3)],
    [{ section: "001", meetings: ["THU 10:00-11:15 E11"] }],
    3006,
  ),
  course(
    { courseCode: "GESB1012", department: "GESB", courseType: "GE", suggestedYear: 2, titleEn: "Financial Literacy" },
    "Personal finance and markets.",
    "Budget and interpret financial news.",
    [prof("IP KA MAN", 4.1)],
    [{ section: "001", meetings: ["FRI 14:00-15:15 E11"] }],
    3011,
  ),
  course(
    { courseCode: "GESB1013", department: "GESB", courseType: "GE", suggestedYear: 1, titleEn: "Ethics and Society" },
    "Social ethics and civic life.",
    "Debate ethical dilemmas.",
    [prof("LEE MEI LING", 4.0)],
    [{ section: "001", meetings: ["WED 10:00-11:15 E11"] }],
    3016,
  ),
  course(
    { courseCode: "GESB1014", department: "GESB", courseType: "GE", suggestedYear: 1, titleEn: "Leadership" },
    "Leadership skills for undergraduates.",
    "Reflect on team leadership.",
    [prof("WONG YU", 3.8)],
    [{ section: "001", meetings: ["MON 15:00-16:15 E11"] }],
    3021,
  ),
  course(
    { courseCode: "GESB1015", department: "GESB", courseType: "GE", suggestedYear: 2, titleEn: "Innovation" },
    "Innovation and entrepreneurship basics.",
    "Pitch an idea with evidence.",
    [prof("CHAN HO", 3.6)],
    [{ section: "001", meetings: ["TUE 13:00-14:15 E11"] }],
    3026,
  ),
  course(
    { courseCode: "CISC1001", department: "CIS", faculty: "FST", courseType: "Non-GE", suggestedYear: 1, titleEn: "Introduction to Computing" },
    "First-year computing fundamentals.",
    "Write simple programs.",
    [prof("LEE KA CHUN", 3.2)],
    [
      { section: "001", meetings: ["MON 13:30-14:45 E11", "THU 13:30-14:45 E11", "WED 08:30-09:45 E11"] },
      { section: "002", meetings: ["TUE 11:00-12:15 E11"] },
    ],
    4001,
  ),
  course(
    { courseCode: "CISC1002", department: "CIS", faculty: "FST", courseType: "Non-GE", suggestedYear: 1, titleEn: "Programming Fundamentals" },
    "Structured programming for beginners.",
    "Implement small algorithms.",
    [prof("HO WAI", 3.5)],
    [{ section: "001", meetings: ["WED 11:00-12:15 E11"] }],
    4010,
  ),
  course(
    { courseCode: "CISC1003", department: "CIS", faculty: "FST", courseType: "Non-GE", suggestedYear: 2, titleEn: "Data Structures" },
    "Core data structures.",
    "Choose appropriate structures.",
    [prof("XU JUN", 2.9)],
    [{ section: "001", meetings: ["FRI 09:00-10:15 E11"] }],
    4015,
  ),
];

function buildMasterPool(): DiscoveryPool {
  const courses: PoolCourse[] = [];
  const instructorRows: PoolInstructorRow[] = [];
  const offers: PoolOffer[] = [];

  for (const entry of FIXTURE_COURSES) {
    courses.push(entry.course);
    const instructor = entry.instructors[0]!;
    for (const section of entry.sections) {
      instructorRows.push(
        pwcRow({
          pwcId: section.pwcId,
          courseCode: entry.course.courseCode,
          instructor: instructor.name,
          reviews: instructor.commentCount,
          result: instructor.result,
          grade: instructor.grade,
          difficulty: instructor.difficulty,
          reward: instructor.reward ?? 3,
        }),
      );
      offers.push(offer(section.pwcId, section.section, section.meetings));
    }
  }

  return pool({
    term: TERM,
    totalMatchingCourses: courses.length,
    truncated: false,
    courses,
    instructorRows,
    offers,
  });
}

export const DISCOVERY_FIXTURE_POOL = buildMasterPool();

const COURSE_BY_CODE = new Map(FIXTURE_COURSES.map((entry) => [entry.course.courseCode, entry]));

function creditMatches(course: PoolCourse, credits: number): boolean {
  const variants = [String(credits), credits.toFixed(1), credits.toFixed(2)];
  return variants.includes(course.credits ?? "");
}

function poolCourseWithTopics(entry: FixtureCourse): PoolCourse {
  return {
    ...entry.course,
    topicBody: [entry.description, entry.ilo].filter(Boolean).join(" "),
  };
}

function scopeAnchor(scope: DiscoveryScope): boolean {
  return Boolean(
    scope.courseType ||
      scope.codePrefix ||
      scope.faculty ||
      scope.department ||
      scope.topics?.length ||
      scope.maxSuggestedYear !== undefined,
  );
}

function filterCourses(scope: DiscoveryScope): {
  courses: PoolCourse[];
  totalMatchingCourses: number;
  truncated: boolean;
  topicFallback: boolean;
  topicTier: 1 | 2 | 3 | null;
} {
  if (!scopeAnchor(scope)) {
    return { courses: [], totalMatchingCourses: 0, truncated: false, topicFallback: false, topicTier: null };
  }

  let filtered = FIXTURE_COURSES.map((entry) => entry.course);
  let topicFallback = false;
  let topicTier: 1 | 2 | 3 | null = null;

  if (scope.courseType) {
    filtered = filtered.filter((course) => course.courseType === scope.courseType);
  }
  if (scope.codePrefix) {
    const prefix = scope.codePrefix.toUpperCase();
    filtered = filtered.filter((course) => course.courseCode.startsWith(prefix));
  }
  if (scope.faculty) {
    filtered = filtered.filter((course) => course.faculty.toUpperCase() === scope.faculty!.toUpperCase());
  }
  if (scope.department) {
    filtered = filtered.filter((course) => course.department.toUpperCase() === scope.department!.toUpperCase());
  }
  if (scope.maxSuggestedYear !== undefined) {
    filtered = filtered.filter(
      (course) => course.suggestedYear !== null && course.suggestedYear <= scope.maxSuggestedYear!,
    );
  }
  if (scope.credits !== undefined) {
    filtered = filtered.filter((course) => creditMatches(course, scope.credits!));
  }
  if (scope.topics?.length) {
    const enriched = filtered
      .map((course) => {
        const entry = COURSE_BY_CODE.get(course.courseCode);
        return entry ? poolCourseWithTopics(entry) : course;
      });
    const topicFiltered = filterCoursesByTopicMatch(enriched, scope.topics);
    filtered = topicFiltered.courses;
    topicFallback = topicFiltered.topicFallback;
    topicTier = topicFiltered.topicTier;
  }
  if (scope.excludeCodes?.length) {
    const excluded = new Set(scope.excludeCodes.map((code) => code.toUpperCase()));
    filtered = filtered.filter((course) => !excluded.has(course.courseCode));
  }

  filtered.sort((a, b) => a.courseCode.localeCompare(b.courseCode));
  const totalMatchingCourses = filtered.length;
  const truncated = totalMatchingCourses > MAX_POOL_COURSES;
  const courses = filtered.slice(0, MAX_POOL_COURSES).map((course) => {
    const entry = COURSE_BY_CODE.get(course.courseCode);
    if (entry && scope.topics?.length) {
      return { ...course, topicBody: [entry.description, entry.ilo].filter(Boolean).join(" ") };
    }
    return course;
  });

  return { courses, totalMatchingCourses, truncated, topicFallback, topicTier };
}

export function filterFixturePool(
  scope: DiscoveryScope,
  term: { year: number; sem: number } = TERM,
): DiscoveryPool {
  const { courses: withoutExclude } = filterCourses({ ...scope, excludeCodes: undefined });
  const excludeSet = new Set((scope.excludeCodes ?? []).map((code) => code.toUpperCase()));
  const excludedCodesMatched = withoutExclude.filter((course) => excludeSet.has(course.courseCode)).length;

  const { courses, totalMatchingCourses, truncated, topicFallback, topicTier } = filterCourses(scope);
  if (courses.length === 0) {
    return {
      term,
      totalMatchingCourses: 0,
      truncated: false,
      excludedCodesMatched,
      offersTruncated: false,
      topicFallback,
      topicTier,
      courses: [],
      instructorRows: [],
      offers: [],
    };
  }

  const codes = new Set(courses.map((course) => course.courseCode));
  const instructorRows = DISCOVERY_FIXTURE_POOL.instructorRows.filter((row) => codes.has(row.courseCode));
  const pwcIds = new Set(instructorRows.map((row) => row.pwcId));
  const offers = DISCOVERY_FIXTURE_POOL.offers.filter((row) => pwcIds.has(row.pwcId));

  return {
    term,
    totalMatchingCourses,
    truncated,
    excludedCodesMatched,
    offersTruncated: false,
    topicFallback,
    topicTier,
    courses,
    instructorRows,
    offers,
  };
}

const REVIEW_TEXTS: Record<number, string[]> = {
  1020: ["One midterm and a final; readings are heavy.", "Weekly quizzes but no second midterm."],
};

export async function loadReviewTexts(pwcIds: number[]): Promise<ReviewTextRow[]> {
  return pwcIds.map((pwcId) => ({ pwcId, texts: REVIEW_TEXTS[pwcId] ?? [] }));
}

export async function loadDiscoveryPool(
  scope: DiscoveryScope,
  term: { year: number; sem: number },
  _signal: AbortSignal,
): Promise<DiscoveryPool> {
  return filterFixturePool(scope, term);
}

function findCourse(code: string): FixtureCourse | undefined {
  return COURSE_BY_CODE.get(code.trim().toUpperCase());
}

function offering(code: string, instructor: string) {
  const course = findCourse(code);
  if (!course) throw new McpToolError("not_found");
  const profEntry = course.instructors.find((entry) => entry.name === instructor) ?? course.instructors[0]!;
  return { course, prof: profEntry };
}

export async function getCourse(input: GetCourseInput): Promise<GetCourseOutput> {
  const course = findCourse(input.code);
  if (!course) throw new McpToolError("not_found");
  const url = absoluteUrl(buildCoursePath(course.course.courseCode));
  return {
    course: {
      courseCode: course.course.courseCode,
      titleEn: course.course.titleEn,
      titleZh: course.course.titleZh,
      credits: course.course.credits,
      faculty: course.course.faculty,
      department: course.course.department,
      programLevel: "Undergraduate",
      suggestedYear:
        course.course.suggestedYear === null ? null : String(course.course.suggestedYear),
      medium: "English",
      gradingSystem: null,
      courseType: course.course.courseType,
      duration: null,
      description: course.description,
      isOffered: true,
      aka: course.course.aka,
      url,
    },
    page: 1,
    hasMore: false,
    totalCount: course.instructors.length,
    instructors: course.instructors.map((profEntry) => ({
      name: profEntry.name,
      commentCount: profEntry.commentCount,
      result: profEntry.result,
      attendance: 3,
      grade: profEntry.grade,
      difficulty: profEntry.difficulty,
      reward: profEntry.reward,
      isOffered: true,
      reviewUrl: absoluteUrl(buildReviewPath(course.course.courseCode, profEntry.name)),
    })),
  };
}

export async function getCourseSections(input: GetCourseSectionsInput): Promise<GetCourseSectionsOutput> {
  const course = findCourse(input.code);
  if (!course) throw new McpToolError("not_found");
  const instructor = input.instructor ?? course.instructors[0]!.name;
  const url = absoluteUrl(buildCoursePath(course.course.courseCode));
  return {
    courseCode: course.course.courseCode,
    instructor,
    courseUrl: url,
    sections: course.sections.map((section) => ({
      section: section.section,
      courseUrl: url,
      schedules: section.meetings.map((line) => {
        const [, weekday, times, location] = line.match(/^(\w+) (\d+:\d+-\d+:\d+) (.+)$/) ?? [];
        const [startTime, endTime] = (times ?? "09:00-10:15").split("-");
        return {
          weekday: weekday ?? "MON",
          startTime: startTime ?? "09:00",
          endTime: endTime ?? "10:15",
          location: location ?? "E11",
        };
      }),
    })),
  };
}

export async function getCourseReviews(input: GetCourseReviewsInput): Promise<GetCourseReviewsOutput> {
  const { course, prof } = offering(input.code, input.instructor);
  const url = absoluteUrl(buildReviewPath(course.course.courseCode, prof.name));
  return {
    courseCode: course.course.courseCode,
    instructor: prof.name,
    page: input.page,
    hasMore: false,
    url,
    reviews: prof.reviews.map((review) => ({
      publishedAt: review.publishedAt,
      content: review.content,
      contentEn: null,
      result: review.result,
      upvotes: 0,
      downvotes: 0,
      verified: false,
      url,
    })),
  };
}

export async function searchCatalogForAssistant(input: SearchCatalogToolInput): Promise<SearchCatalogOutput> {
  const query = input.query?.trim().toLowerCase() ?? "";
  const filtered = FIXTURE_COURSES.filter(({ course }) => {
    const fields = [course.courseCode, course.titleEn, course.titleZh];
    return (
      (!query || fields.some((text) => text.toLowerCase().includes(query))) &&
      (!input.faculty || course.faculty === input.faculty.toUpperCase()) &&
      (!input.department || course.department === input.department.toUpperCase()) &&
      (!input.credits || course.credits === input.credits)
    );
  }).map(({ course }) => course);

  const offset = (input.page - 1) * input.limit;
  return {
    type: "course",
    page: input.page,
    totalCount: filtered.length,
    hasMore: input.page * input.limit < filtered.length,
    results: filtered.slice(offset, offset + input.limit).map((course) => ({
      courseCode: course.courseCode,
      titleEn: course.titleEn,
      titleZh: course.titleZh,
      credits: course.credits,
      faculty: course.faculty,
      department: course.department,
      isOffered: true,
      aka: course.aka,
      url: absoluteUrl(buildCoursePath(course.courseCode)),
    })),
  };
}

export async function countCoursesForAssistant(input: CountCoursesInput): Promise<{ totalCount: number }> {
  const result = await searchCatalogForAssistant({
    ...input,
    type: "course",
    sortBy: "code",
    sortOrder: "asc",
    limit: 50,
    page: 1,
  });
  return { totalCount: result.type === "course" ? result.totalCount : 0 };
}

export async function getCourseText(
  code: string,
  part: "description" | "ilo",
): Promise<CourseTextOutput> {
  const course = findCourse(code);
  if (!course) throw new McpToolError("not_found");
  return {
    courseCode: course.course.courseCode,
    titleEn: course.course.titleEn,
    titleZh: course.course.titleZh,
    text: part === "description" ? course.description : course.ilo,
    truncated: false,
    aka: course.course.aka,
    url: absoluteUrl(buildCoursePath(course.course.courseCode)),
  };
}

export async function getInstructorForAssistant(input: GetInstructorToolInput): Promise<GetInstructorOutput> {
  const base = await getInstructor({ name: input.name, limit: 20, page: 1 } as GetInstructorInput);
  return base;
}

export async function getInstructor(input: GetInstructorInput): Promise<GetInstructorOutput> {
  const courses = FIXTURE_COURSES.flatMap(({ course, instructors }) =>
    instructors
      .filter((profEntry) => profEntry.name === input.name)
      .map((profEntry) => ({
        courseCode: course.courseCode,
        commentCount: profEntry.commentCount,
        result: profEntry.result,
        attendance: 3,
        grade: profEntry.grade,
        difficulty: profEntry.difficulty,
        reward: profEntry.reward,
        isOffered: true,
        courseUrl: absoluteUrl(buildCoursePath(course.courseCode)),
        reviewUrl: absoluteUrl(buildReviewPath(course.courseCode, profEntry.name)),
      })),
  );
  if (courses.length === 0) throw new McpToolError("not_found");
  return {
    name: input.name,
    page: input.page,
    totalCount: courses.length,
    hasMore: false,
    courses,
  };
}

export async function countCourseReviews(input: CountReviewsInput): Promise<{ totalCount: number }> {
  const { prof } = offering(input.code, input.instructor);
  return { totalCount: prof.commentCount };
}

export const DISCOVERY_CATALOG_FACTS: CatalogFacts = {
  courseCodes: FIXTURE_COURSES.map((entry) => entry.course.courseCode),
  officialTitles: FIXTURE_COURSES.flatMap((entry) => [entry.course.titleEn, entry.course.titleZh].filter(Boolean)),
  instructorNames: FIXTURE_COURSES.flatMap((entry) => entry.instructors.map((profEntry) => profEntry.name)),
};

export const GEGA_PLAN: LocalPlan = {
  clientRef: "discovery-gega",
  name: "GE plan",
  year: 2026,
  sem: 1,
  revision: 1,
  syncState: "idle",
  payload: {
    schemaVersion: 1,
    sections: [
      normalizePlanSection({
        courseCode: "GEGA1000",
        prof: "CHAN TAI MAN",
        section: "007",
        schedules: [
          { date: "MON", time: "13:00-14:15", location: "E11" },
          { date: "THU", time: "13:00-14:15", location: "E11" },
        ],
      }),
    ],
  },
};

export const GEGA_PLAN_WITH_OVERLAP: LocalPlan = {
  ...GEGA_PLAN,
  revision: 2,
  payload: {
    schemaVersion: 1,
    sections: [
      ...GEGA_PLAN.payload.sections,
      normalizePlanSection({
        courseCode: "ART1001",
        prof: "LAM",
        section: "001",
        schedules: [{ date: "TUE", time: "11:30-12:45", location: "E11" }],
      }),
    ],
  },
};

export const NINE_CREDIT_PLAN: LocalPlan = {
  clientRef: "discovery-9cr",
  name: "Nine credits",
  year: 2026,
  sem: 1,
  revision: 1,
  syncState: "idle",
  payload: {
    schemaVersion: 1,
    sections: [
      normalizePlanSection({
        courseCode: "GEST1001",
        prof: "CHAN MEI LING",
        section: "001",
        schedules: [
          { date: "MON", time: "09:00-10:15", location: "E11" },
          { date: "WED", time: "09:00-10:15", location: "E11" },
        ],
      }),
      normalizePlanSection({
        courseCode: "GEGA1001",
        prof: "LEE MEI LING",
        section: "001",
        schedules: [{ date: "MON", time: "11:00-12:15", location: "E11" }],
      }),
      normalizePlanSection({
        courseCode: "CISC1002",
        prof: "HO WAI",
        section: "001",
        schedules: [{ date: "WED", time: "11:00-12:15", location: "E11" }],
      }),
    ],
  },
};

export function timetablePayload(plan?: LocalPlan): TimetableContextPayload {
  return buildTimetableContextPayload(plannerState(plan), plannerCurrentTerm());
}

export const DEFAULT_DISCOVERY_TIMETABLE = timetablePayload(undefined);
