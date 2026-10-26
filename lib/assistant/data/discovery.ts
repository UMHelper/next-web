import { topicScore } from "@/lib/assistant/discovery/rank";
import type { DiscoveryScope } from "@/lib/assistant/discovery/schema";
import type { DiscoveryPool, PoolCourse, PoolInstructorRow, PoolOffer, ReviewTextRow } from "@/lib/assistant/discovery/pool";
import { McpToolError } from "@/lib/mcp/errors";
import supabaseServer from "@/lib/supabase/server";

import { sanitizeSearchTerm } from "./search-catalog";

export const MAX_POOL_COURSES = 150;
export const IN_CHUNK = 200;
export const MAX_CATALOG_TOPIC_SCAN = 600;
export const MAX_OFFER_ROWS = 8000;

export type SupabaseLike = Pick<typeof supabaseServer, "from">;

const CATALOG_COLUMNS_BASE =
  "New_code,courseTitleEng,courseTitleChi,Offering_Unit,Offering_Department,Credits,courseType,suggestedYearOfStudy,equivalent_codes";
const CATALOG_COLUMNS_WITH_TOPICS = `${CATALOG_COLUMNS_BASE},courseDescription,ilo`;
const TOPIC_FIELDS = ["courseTitleEng", "courseTitleChi", "courseDescription", "ilo"] as const;
const PWC_COLUMNS = "id,course_id,prof_id,comments,result,grade,hard,reward";
const OFFER_COLUMNS = "course_id,section,schedule(time_location(date,times,location))";

function readText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function readNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function readNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function readCount(value: unknown): number {
  const num = readNullableNumber(value);
  return num === null ? 0 : Math.max(0, Math.trunc(num));
}

function readCodes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);
}

function toRows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry),
  );
}

function creditVariants(value: number): string[] {
  return [String(value), value.toFixed(1), value.toFixed(2)];
}

function buildTopicOr(topics: string[]): string {
  const parts: string[] = [];
  for (const raw of topics) {
    const term = sanitizeSearchTerm(raw);
    if (!term) continue;
    for (const field of TOPIC_FIELDS) {
      parts.push(`${field}.ilike.%${term}%`);
    }
  }
  return parts.join(",");
}

function chunkValues<T>(values: T[], size: number): T[][] {
  if (values.length === 0) return [];
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function projectPoolCourse(row: Record<string, unknown>, includeTopicBody: boolean): PoolCourse | null {
  const code = readText(row.New_code);
  if (!code) return null;

  const description = readText(row.courseDescription);
  const ilo = readText(row.ilo);

  return {
    courseCode: code.toUpperCase(),
    titleEn: readText(row.courseTitleEng) ?? "",
    titleZh: readText(row.courseTitleChi) ?? "",
    credits: readText(row.Credits),
    courseType: readText(row.courseType),
    suggestedYear: readNullableNumber(row.suggestedYearOfStudy),
    faculty: readText(row.Offering_Unit) ?? "",
    department: readText(row.Offering_Department) ?? "",
    aka: readCodes(row.equivalent_codes),
    topicTitle: "",
    topicBody: includeTopicBody ? [description, ilo].filter(Boolean).join(" ") : "",
  };
}

function buildCodeToPrimary(courses: PoolCourse[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const course of courses) {
    map.set(course.courseCode, course.courseCode);
    for (const aka of course.aka) {
      map.set(aka, course.courseCode);
    }
  }
  return map;
}

function collectLookupCodes(courses: PoolCourse[]): string[] {
  const codes = new Set<string>();
  for (const course of courses) {
    codes.add(course.courseCode);
    for (const aka of course.aka) {
      codes.add(aka);
    }
  }
  return [...codes];
}

function applyCatalogFilters(builder: any, scope: DiscoveryScope): any {
  let next = builder.eq("Is_Offered", 1);

  if (scope.courseType) next = next.eq("courseType", scope.courseType);
  if (scope.codePrefix) next = next.ilike("New_code", `${scope.codePrefix}%`);
  if (scope.faculty) next = next.eq("Offering_Unit", scope.faculty);
  if (scope.department) next = next.eq("Offering_Department", scope.department);
  if (scope.maxSuggestedYear !== undefined) {
    next = next.lte("suggestedYearOfStudy", scope.maxSuggestedYear);
  }
  if (scope.credits !== undefined) {
    next = next.in("Credits", creditVariants(scope.credits));
  }
  if (scope.topics?.length) {
    const orFilter = buildTopicOr(scope.topics);
    if (orFilter) next = next.or(orFilter);
  }
  if (scope.excludeCodes?.length) {
    const quoted = scope.excludeCodes.map((code) => `"${code}"`).join(",");
    next = next.not("New_code", "in", `(${quoted})`);
  }

  return next;
}

function projectInstructorRow(
  row: Record<string, unknown>,
  codeToPrimary: Map<string, string>,
): PoolInstructorRow | null {
  const pwcId = readCount(row.id);
  if (pwcId <= 0) return null;

  const rawCode = readText(row.course_id)?.toUpperCase();
  if (!rawCode) return null;

  const courseCode = codeToPrimary.get(rawCode) ?? rawCode;
  const instructor = readText(row.prof_id);
  if (!instructor) return null;

  return {
    pwcId,
    courseCode,
    instructor,
    reviews: readCount(row.comments),
    result: readNumber(row.result),
    grade: readNumber(row.grade),
    difficulty: readNumber(row.hard),
    reward: readNullableNumber(row.reward),
  };
}

function projectOffer(row: Record<string, unknown>): PoolOffer | null {
  const pwcId = readCount(row.course_id);
  const section = readText(row.section);
  if (pwcId <= 0 || !section) return null;

  const meetings: PoolOffer["meetings"] = [];
  for (const scheduleRow of toRows(row.schedule)) {
    for (const locationRow of toRows(scheduleRow.time_location)) {
      meetings.push({
        date: locationRow.date,
        times: locationRow.times,
        location: locationRow.location,
      });
    }
  }

  return { pwcId, section, meetings };
}

async function readCatalogPage(
  scope: DiscoveryScope,
  signal: AbortSignal,
  client: SupabaseLike,
  range: { from: number; to: number },
  includeTopics: boolean,
): Promise<{ rows: PoolCourse[]; totalMatchingCourses: number }> {
  const columns = includeTopics ? CATALOG_COLUMNS_WITH_TOPICS : CATALOG_COLUMNS_BASE;
  const builder = await applyCatalogFilters(client.from("course_catalog").select(columns, { count: "exact" }), scope)
    .order("New_code", { ascending: true })
    .range(range.from, range.to)
    .abortSignal(signal);

  if (builder.error) throw new McpToolError("temporarily_unavailable");

  const totalMatchingCourses =
    typeof builder.count === "number" && builder.count >= 0 ? builder.count : toRows(builder.data).length;
  const rows = toRows(builder.data)
    .map((row) => projectPoolCourse(row, includeTopics))
    .filter((course): course is PoolCourse => course !== null);

  return { rows, totalMatchingCourses };
}

async function readCatalog(
  scope: DiscoveryScope,
  signal: AbortSignal,
  client: SupabaseLike,
): Promise<{ courses: PoolCourse[]; totalMatchingCourses: number; truncated: boolean }> {
  const includeTopics = Boolean(scope.topics?.length);
  const topics = scope.topics ?? [];

  const first = await readCatalogPage(scope, signal, client, { from: 0, to: MAX_POOL_COURSES - 1 }, includeTopics);
  let totalMatchingCourses = first.totalMatchingCourses;
  let courses = first.rows;

  if (includeTopics && topics.length > 0 && totalMatchingCourses > MAX_POOL_COURSES) {
    const scanLimit = Math.min(totalMatchingCourses, MAX_CATALOG_TOPIC_SCAN);
    const scanned: PoolCourse[] = [...courses];
    for (let from = MAX_POOL_COURSES; from < scanLimit; from += MAX_POOL_COURSES) {
      const page = await readCatalogPage(
        scope,
        signal,
        client,
        { from, to: Math.min(from + MAX_POOL_COURSES - 1, scanLimit - 1) },
        includeTopics,
      );
      scanned.push(...page.rows);
      totalMatchingCourses = page.totalMatchingCourses;
    }
    courses = scanned
      .sort((left, right) => {
        const scoreDelta = topicScore(right, topics) - topicScore(left, topics);
        if (scoreDelta !== 0) return scoreDelta;
        return left.courseCode.localeCompare(right.courseCode);
      })
      .slice(0, MAX_POOL_COURSES);
  }

  return {
    courses,
    totalMatchingCourses,
    truncated: totalMatchingCourses > courses.length,
  };
}

async function readInstructorRows(
  courses: PoolCourse[],
  signal: AbortSignal,
  client: SupabaseLike,
): Promise<PoolInstructorRow[]> {
  const lookupCodes = collectLookupCodes(courses);
  if (lookupCodes.length === 0) return [];

  const codeToPrimary = buildCodeToPrimary(courses);
  const rows: PoolInstructorRow[] = [];

  for (const chunk of chunkValues(lookupCodes, IN_CHUNK)) {
    const builder = await client
      .from("prof_with_course")
      .select(PWC_COLUMNS)
      .in("course_id", chunk)
      .abortSignal(signal);

    if (builder.error) throw new McpToolError("temporarily_unavailable");

    for (const row of toRows(builder.data)) {
      const projected = projectInstructorRow(row, codeToPrimary);
      if (projected) rows.push(projected);
    }
  }

  return rows;
}

async function readOffers(
  pwcIds: number[],
  term: { year: number; sem: number },
  signal: AbortSignal,
  client: SupabaseLike,
): Promise<PoolOffer[]> {
  if (pwcIds.length === 0) return [];

  const offers: PoolOffer[] = [];
  for (const chunk of chunkValues(pwcIds, IN_CHUNK)) {
    const builder = await client
      .from("offer")
      .select(OFFER_COLUMNS)
      .eq("year", term.year)
      .eq("sem", term.sem)
      .in("course_id", chunk)
      .abortSignal(signal);

    if (builder.error) throw new McpToolError("temporarily_unavailable");

    for (const row of toRows(builder.data)) {
      if (offers.length >= MAX_OFFER_ROWS) {
        return offers;
      }
      const projected = projectOffer(row);
      if (projected) offers.push(projected);
    }
  }

  return offers;
}

function reviewTextsFromRow(row: Record<string, unknown>): string[] {
  const texts: string[] = [];
  const content = readText(row.content);
  const contentEn = readText(row.content_en);
  if (content) texts.push(content);
  if (contentEn) texts.push(contentEn);
  return texts;
}

export async function loadDiscoveryPool(
  scope: DiscoveryScope,
  term: { year: number; sem: number },
  signal: AbortSignal,
  client: SupabaseLike = supabaseServer,
): Promise<DiscoveryPool> {
  let excludedCodesMatched = 0;
  if (scope.excludeCodes?.length) {
    const { courses: withoutExcludeApplied } = await readCatalog(
      { ...scope, excludeCodes: undefined },
      signal,
      client,
    );
    const excludeSet = new Set(scope.excludeCodes);
    excludedCodesMatched = withoutExcludeApplied.filter((course) => excludeSet.has(course.courseCode)).length;
  }

  const { courses, totalMatchingCourses, truncated } = await readCatalog(scope, signal, client);
  if (courses.length === 0) {
    return {
      term,
      totalMatchingCourses,
      truncated: false,
      excludedCodesMatched,
      offersTruncated: false,
      courses: [],
      instructorRows: [],
      offers: [],
    };
  }

  const instructorRows = await readInstructorRows(courses, signal, client);
  const pwcIds = [...new Set(instructorRows.map((row) => row.pwcId))];
  const offersBefore = await readOffers(pwcIds, term, signal, client);
  const offersTruncated = offersBefore.length >= MAX_OFFER_ROWS;

  return {
    term,
    totalMatchingCourses,
    truncated,
    excludedCodesMatched,
    offersTruncated,
    courses,
    instructorRows,
    offers: offersBefore,
  };
}

export async function loadReviewTexts(
  pwcIds: number[],
  signal: AbortSignal,
  client: SupabaseLike = supabaseServer,
): Promise<ReviewTextRow[]> {
  return Promise.all(
    pwcIds.map(async (pwcId) => {
      const builder = await client
        .from("comment")
        .select("content,content_en")
        .eq("course_id", pwcId)
        .is("replyto", null)
        .neq("hidden", 1)
        .order("pub_time", { ascending: false })
        .limit(8)
        .abortSignal(signal);

      if (builder.error) throw new McpToolError("temporarily_unavailable");

      const texts = toRows(builder.data).flatMap(reviewTextsFromRow);
      return { pwcId, texts };
    }),
  );
}
