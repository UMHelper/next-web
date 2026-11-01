import {
  collectCatalogSearchSnapshots,
  newestSuccessfulCourseSearchCallId,
  type CatalogSearchSnapshot,
} from "@/lib/assistant/catalog-research";
import { FILTER_CATALOG_RESULTS_TOOL_NAME } from "@/lib/assistant/catalog-tool-names";
import { parseCourseDetailResult, GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import { clarificationAsk } from "@/lib/assistant/course-referent";
import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";
import {
  GET_COURSE_SECTIONS_TOOL_NAME,
  parseCourseSectionsResult,
} from "@/lib/assistant/course-sections-ui";
import {
  discoveryEvidenceFromCalls,
  sectionsByCourseFromDiscoverContent,
} from "@/lib/assistant/discovery/evidence";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { SEARCH_CATALOG_TOOL_NAME } from "@/lib/assistant/search-catalog-ui";

export const PRESENT_RESPONSE_TOOL_NAME = "present_response";
export const MAX_PRESENT_SHOW_ITEMS = 5;
export const MAX_PRESENT_RECOMMENDATIONS = 5;

export type PresentComponent = "course_detail" | "course_sections";
export type PresentShow = { component: PresentComponent; course: string };
export type PresentCatalog = { mode: "browse"; resultSetId?: string } | { mode: "hidden" };
export type PresentRequest = {
  show: PresentShow[];
  catalog?: PresentCatalog;
  recommendations?: { courses: string[]; sections: Record<string, string> };
};
export type PresentEligibility = "ready" | "missing_lookup" | "lookup_failed";
export type CatalogPresentEligibility = "ready" | "missing_search" | "lookup_failed";
export type RecommendationEligibility = "ready" | "not_in_turn_evidence";
export type PresentReceipt =
  | {
      status: "requested";
      items: Array<PresentShow & { eligibility: PresentEligibility }>;
      catalog?: { mode: "browse" | "hidden"; resultSetId?: string; eligibility: CatalogPresentEligibility };
      recommendations?: { items: Array<{ course: string; eligibility: RecommendationEligibility }> };
      note: string;
    }
  | { status: "rejected"; reason: "invalid_request" };
export type LookupRecord = { component: PresentComponent; argument: string; canonical: string | null; ok: boolean };
export type CatalogSearchRecord = CatalogSearchSnapshot;
export type PresentationLedger = {
  lookups: LookupRecord[];
  catalogSearches: CatalogSearchRecord[];
  discoveries: Array<{ sectionsByCourse: Record<string, string[]> }>;
  pending: Set<Promise<unknown>>;
};
export type PresentationSlot = { current: PresentationLedger };
export type ToolCallLike = { id: string; function: { name: string; arguments: string } };
export type RichBlock =
  | { kind: "tool"; callId: string }
  | { kind: "recommendations"; presentCallId: string; courses: string[]; sections: Record<string, string> };

export function toolMessageContent(raw: unknown): string | undefined {
  if (typeof raw === "string") return raw;
  if (raw === undefined || raw === null) return undefined;
  try {
    return JSON.stringify(raw);
  } catch {
    return undefined;
  }
}

export const PRESENT_RECEIPT_NOTE =
  "ready means the chat will display this card with your reply; it does not confirm the student has seen it, so never describe it as shown above. missing_lookup means no matching lookup ran in this turn: call get_course or get_course_sections for that course first, then present again, or answer in text. lookup_failed means the lookup did not return data, so no card will appear. catalog ready means a browse list can mount for the resolved resultSetId; missing_search means no matching search_catalog ran in this turn. recommendations ready means the course appeared in this turn's search, get_course, or discover_course_candidates evidence; a CODE-SECTION claim must match a section from that discovery result.";

const COURSE_CODE_RE = /^[A-Z]{4}\d{4}$/;
const RECOMMENDATION_ENTRY_RE = /^[A-Z]{4}\d{4}(-[A-Z0-9]{1,6})?$/;
const PRESENT_COMPONENTS: ReadonlySet<string> = new Set(["course_detail", "course_sections"]);

function normalizeCourseCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  return COURSE_CODE_RE.test(upper) ? upper : null;
}

function readCallCode(call: ToolCallLike): string {
  try {
    const args = JSON.parse(call.function.arguments) as unknown;
    if (args !== null && typeof args === "object" && !Array.isArray(args)) {
      const code = (args as { code?: unknown }).code;
      if (typeof code === "string") {
        return code.trim().toUpperCase();
      }
    }
  } catch {
    // ignore malformed tool arguments
  }
  return "";
}

function readCallInstructor(call: ToolCallLike): string {
  try {
    const args = JSON.parse(call.function.arguments) as unknown;
    if (args !== null && typeof args === "object" && !Array.isArray(args)) {
      const instructor = (args as { instructor?: unknown }).instructor;
      if (typeof instructor === "string") {
        return instructor.trim();
      }
    }
  } catch {
    // ignore malformed tool arguments
  }
  return "";
}

function courseDedupeKey(call: ToolCallLike, content: string | undefined): string {
  const identity = courseCallIdentity(call, content);
  return identity.canonical ?? identity.argument;
}

function sectionDedupeKey(call: ToolCallLike, content: string | undefined): string {
  const identity = sectionCallIdentity(call, content);
  const course = identity.canonical ?? identity.argument;
  return `${course}\0${readCallInstructor(call)}`;
}

function claimedLookupWinners(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
  show: PresentShow[],
): { course: Map<string, string>; sections: Map<string, string> } {
  const courseWinners = new Map<string, string>();
  const courseOk = new Map<string, boolean>();
  const sectionWinners = new Map<string, string>();
  const sectionOk = new Map<string, boolean>();

  for (const call of calls) {
    const name = call.function.name;
    const content = toolMessageContent(results.get(call.id)?.content);

    if (name === GET_COURSE_TOOL_NAME && isClaimed(call, content, show, "course_detail", courseCallIdentity)) {
      const key = courseDedupeKey(call, content);
      const ok = lookupOk(name, content);
      if (!courseWinners.has(key)) {
        courseWinners.set(key, call.id);
        courseOk.set(key, ok);
        continue;
      }
      if (!courseOk.get(key) && ok) {
        courseWinners.set(key, call.id);
        courseOk.set(key, ok);
      }
    }

    if (
      name === GET_COURSE_SECTIONS_TOOL_NAME &&
      isClaimed(call, content, show, "course_sections", sectionCallIdentity)
    ) {
      const key = sectionDedupeKey(call, content);
      const ok = lookupOk(name, content);
      if (!sectionWinners.has(key)) {
        sectionWinners.set(key, call.id);
        sectionOk.set(key, ok);
        continue;
      }
      if (!sectionOk.get(key) && ok) {
        sectionWinners.set(key, call.id);
        sectionOk.set(key, ok);
      }
    }
  }

  return { course: courseWinners, sections: sectionWinners };
}

function resultRejected(content: string): boolean {
  try {
    const body = JSON.parse(content) as unknown;
    if (body !== null && typeof body === "object" && !Array.isArray(body)) {
      return (body as { status?: unknown }).status === "rejected";
    }
  } catch {
    // not a structured rejection payload
  }
  return false;
}

function requestHasPresentationIntent(request: PresentRequest): boolean {
  if (request.show.length > 0) return true;
  if (request.catalog?.mode === "browse") return true;
  if ((request.recommendations?.courses.length ?? 0) > 0) return true;
  return false;
}

export function createPresentationLedger(): PresentationLedger {
  return { lookups: [], catalogSearches: [], discoveries: [], pending: new Set() };
}

function parsePresentCatalog(raw: unknown): PresentCatalog | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const mode = record.mode;
  if (mode === "hidden") {
    return { mode: "hidden" };
  }
  if (mode === "browse") {
    const resultSetId = record.resultSetId;
    if (resultSetId === undefined) {
      return { mode: "browse" };
    }
    if (typeof resultSetId !== "string" || resultSetId.length < 1 || resultSetId.length > 128) {
      return null;
    }
    return { mode: "browse", resultSetId };
  }
  return null;
}

function parseRecommendationEntry(raw: unknown): { code: string; section?: string } | null {
  if (typeof raw !== "string") return null;
  const upper = raw.trim().toUpperCase();
  if (!RECOMMENDATION_ENTRY_RE.test(upper)) return null;
  const dash = upper.indexOf("-");
  if (dash === -1) {
    return { code: upper };
  }
  return { code: upper.slice(0, dash), section: upper.slice(dash + 1) };
}

function parsePresentRecommendations(
  raw: unknown,
): { courses: string[]; sections: Record<string, string> } | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const coursesRaw = record.courses;
  if (!Array.isArray(coursesRaw)) return null;
  const seen = new Set<string>();
  const courses: string[] = [];
  const sections: Record<string, string> = {};
  for (const entry of coursesRaw) {
    if (courses.length >= MAX_PRESENT_RECOMMENDATIONS) return null;
    const parsed = parseRecommendationEntry(entry);
    if (!parsed || seen.has(parsed.code)) return null;
    seen.add(parsed.code);
    courses.push(parsed.code);
    if (parsed.section !== undefined) {
      sections[parsed.code] = parsed.section;
    }
  }
  return { courses, sections };
}

export function parsePresentRequest(args: unknown): PresentRequest | null {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }

  const record = args as Record<string, unknown>;
  const showRaw = record.show;
  const catalogRaw = record.catalog;
  const recommendationsRaw = record.recommendations;

  let show: PresentShow[] = [];

  if (showRaw === undefined) {
    if (
      catalogRaw === undefined &&
      recommendationsRaw === undefined &&
      Object.keys(record).length === 0
    ) {
      return { show: [] };
    }
    if (catalogRaw === undefined && recommendationsRaw === undefined) {
      return null;
    }
  } else {
    if (!Array.isArray(showRaw)) {
      return null;
    }
    const seen = new Set<string>();
    for (const item of showRaw) {
      if (show.length >= MAX_PRESENT_SHOW_ITEMS) {
        return null;
      }
      if (item === null || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const entry = item as { component?: unknown; course?: unknown };
      if (typeof entry.component !== "string" || !PRESENT_COMPONENTS.has(entry.component)) {
        return null;
      }
      const course = normalizeCourseCode(entry.course);
      if (!course) {
        return null;
      }
      const key = `${entry.component}:${course}`;
      if (seen.has(key)) {
        return null;
      }
      seen.add(key);
      show.push({ component: entry.component as PresentComponent, course });
    }
  }

  const catalog = parsePresentCatalog(catalogRaw);
  if (catalog === null) return null;

  const recommendations = parsePresentRecommendations(recommendationsRaw);
  if (recommendations === null) return null;

  const request: PresentRequest = { show };
  if (catalog !== undefined) request.catalog = catalog;
  if (recommendations !== undefined) request.recommendations = recommendations;

  return request;
}

export function parsePresentArguments(argumentsJson: string): PresentRequest | null {
  try {
    return parsePresentRequest(JSON.parse(argumentsJson));
  } catch {
    return null;
  }
}

export function lookupOk(toolName: string, content: string | undefined): boolean {
  if (typeof content !== "string") return false;
  if (toolName === GET_COURSE_TOOL_NAME) {
    return parseCourseDetailResult(content).kind === "course";
  }
  if (toolName === GET_COURSE_SECTIONS_TOOL_NAME) {
    const parsed = parseCourseSectionsResult(content);
    return parsed.kind === "sections" || parsed.kind === "empty";
  }
  return false;
}

export function lookupRecordFor(
  toolName: string,
  argumentsJson: string,
  content: string | undefined,
): LookupRecord | null {
  if (toolName !== GET_COURSE_TOOL_NAME && toolName !== GET_COURSE_SECTIONS_TOOL_NAME) {
    return null;
  }

  const component: PresentComponent =
    toolName === GET_COURSE_TOOL_NAME ? "course_detail" : "course_sections";
  const call: ToolCallLike = { id: "", function: { name: toolName, arguments: argumentsJson } };
  const identity =
    toolName === GET_COURSE_TOOL_NAME
      ? courseCallIdentity(call, content)
      : sectionCallIdentity(call, content);

  return {
    component,
    argument: identity.argument,
    canonical: identity.canonical,
    ok: lookupOk(toolName, content),
  };
}

export function catalogSearchRecordFor(
  callId: string,
  argumentsJson: string,
  content: string | undefined,
): CatalogSearchRecord {
  return collectCatalogSearchSnapshots(
    [{ id: callId, function: { name: SEARCH_CATALOG_TOOL_NAME, arguments: argumentsJson } }],
    new Map([[callId, { content }]]),
  )[0]!;
}

export function trackDiscovery<T>(ledger: PresentationLedger, run: Promise<T>): Promise<T> {
  const tracked = run
    .then((result) => {
      const content = typeof result === "string" ? result : JSON.stringify(result);
      const sectionsByCourse = sectionsByCourseFromDiscoverContent(content);
      if (sectionsByCourse) {
        ledger.discoveries.push({ sectionsByCourse });
      }
      return result;
    })
    .finally(() => {
      ledger.pending.delete(tracked);
    });
  ledger.pending.add(tracked);
  return tracked;
}

export function trackLookup<T>(
  ledger: PresentationLedger,
  toolName: string,
  args: unknown,
  run: Promise<T>,
): Promise<T> {
  const argumentsJson = JSON.stringify(args);
  const tracked = run
    .then((result) => {
      const content = typeof result === "string" ? result : JSON.stringify(result);
      const record = lookupRecordFor(toolName, argumentsJson, content);
      if (record) {
        ledger.lookups.push(record);
      }
      return result;
    })
    .finally(() => {
      ledger.pending.delete(tracked);
    });
  ledger.pending.add(tracked);
  return tracked;
}

function lastUserMessageIndex(messages: readonly DiscussedMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

export function seedLedgerFromMessages(ledger: PresentationLedger, messages: readonly DiscussedMessage[]): void {
  const start = lastUserMessageIndex(messages);
  if (start < 0) return;

  const toolContent = new Map<string, string>();
  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.role === "tool" && typeof message.toolCallId === "string") {
      const content =
        typeof message.content === "string"
          ? message.content
          : message.content === undefined
            ? undefined
            : JSON.stringify(message.content);
      if (typeof content === "string") {
        toolContent.set(message.toolCallId, content);
      }
    }
  }

  for (let index = start; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (message.role !== "assistant" || !message.toolCalls) continue;

    for (const toolCall of message.toolCalls) {
      const name = toolCall.function?.name;
      const argumentsJson = toolCall.function?.arguments;
      const id = toolCall.id;
      if (typeof argumentsJson !== "string" || typeof id !== "string") {
        continue;
      }

      if (name === GET_COURSE_TOOL_NAME || name === GET_COURSE_SECTIONS_TOOL_NAME) {
        const record = lookupRecordFor(name, argumentsJson, toolContent.get(id));
        if (record) {
          ledger.lookups.push(record);
        }
        continue;
      }

      if (name === SEARCH_CATALOG_TOOL_NAME) {
        ledger.catalogSearches.push(
          catalogSearchRecordFor(id, argumentsJson, toolContent.get(id)),
        );
        continue;
      }

      if (name === DISCOVER_COURSE_CANDIDATES_TOOL_NAME) {
        const sectionsByCourse = sectionsByCourseFromDiscoverContent(toolContent.get(id));
        if (sectionsByCourse) {
          ledger.discoveries.push({ sectionsByCourse });
        }
      }
    }
  }
}

function claimMatchesRecord(claim: PresentShow, record: LookupRecord): boolean {
  if (claim.component !== record.component) return false;
  if (claim.course === record.argument) return true;
  if (record.canonical !== null && claim.course === record.canonical) return true;
  return false;
}

function eligibilityForItem(claim: PresentShow, ledger: PresentationLedger): PresentEligibility {
  const matching = ledger.lookups.filter((record) => claimMatchesRecord(claim, record));
  if (matching.length === 0) return "missing_lookup";
  if (matching.some((record) => record.ok)) return "ready";
  return "lookup_failed";
}

function ledgerDiscoverySections(ledger: PresentationLedger): Map<string, Set<string>> {
  const byCourse = new Map<string, Set<string>>();
  for (const entry of ledger.discoveries) {
    for (const [code, sections] of Object.entries(entry.sectionsByCourse)) {
      byCourse.set(code.trim().toUpperCase(), new Set(sections));
    }
  }
  return byCourse;
}

function ledgerEvidenceCourseCodes(ledger: PresentationLedger): Set<string> {
  const codes = new Set<string>();
  for (const lookup of ledger.lookups) {
    if (lookup.ok) {
      codes.add(lookup.canonical ?? lookup.argument);
    }
  }
  for (const search of ledger.catalogSearches) {
    for (const course of search.courses) {
      codes.add(course.courseCode.trim().toUpperCase());
    }
  }
  for (const code of ledgerDiscoverySections(ledger).keys()) {
    codes.add(code);
  }
  return codes;
}

function recommendationEligibilityForCode(
  code: string,
  requestedSection: string | undefined,
  evidence: Set<string>,
  discoverySections: Map<string, Set<string>>,
): RecommendationEligibility {
  if (requestedSection !== undefined) {
    return discoverySections.get(code)?.has(requestedSection) ? "ready" : "not_in_turn_evidence";
  }
  return evidence.has(code) ? "ready" : "not_in_turn_evidence";
}

function catalogEligibility(
  catalog: PresentCatalog | undefined,
  ledger: PresentationLedger,
): { eligibility: CatalogPresentEligibility; resultSetId?: string } | undefined {
  if (!catalog || catalog.mode === "hidden") {
    return undefined;
  }

  const snapshots = ledger.catalogSearches;
  if (snapshots.length === 0) {
    return { eligibility: "missing_search" };
  }

  let targetId = catalog.resultSetId;
  if (!targetId) {
    targetId = newestSuccessfulCourseSearchCallId(snapshots);
  }

  if (!targetId) {
    return { eligibility: "lookup_failed" };
  }

  const match = snapshots.find((entry) => entry.callId === targetId);
  if (!match) {
    return { eligibility: "missing_search", resultSetId: targetId };
  }
  if (!match.ok || match.kind === "failure") {
    return { eligibility: "lookup_failed", resultSetId: targetId };
  }

  return { eligibility: "ready", resultSetId: targetId };
}

export async function executePresentResponse(
  args: unknown,
  ledger: PresentationLedger,
): Promise<PresentReceipt> {
  await Promise.allSettled(ledger.pending);

  const request = parsePresentRequest(args);
  if (!request) {
    return { status: "rejected", reason: "invalid_request" };
  }

  const evidence = ledgerEvidenceCourseCodes(ledger);
  const discoverySections = ledgerDiscoverySections(ledger);
  const catalogStatus = catalogEligibility(request.catalog, ledger);

  const receipt: PresentReceipt = {
    status: "requested",
    items: request.show.map((item) => ({
      ...item,
      eligibility: eligibilityForItem(item, ledger),
    })),
    note: PRESENT_RECEIPT_NOTE,
  };

  if (request.catalog) {
    receipt.catalog = {
      mode: request.catalog.mode,
      resultSetId: catalogStatus?.resultSetId,
      eligibility: catalogStatus?.eligibility ?? "missing_search",
    };
  }

  if (request.recommendations?.courses.length) {
    receipt.recommendations = {
      items: request.recommendations.courses.map((course) => ({
        course,
        eligibility: recommendationEligibilityForCode(
          course,
          request.recommendations!.sections[course],
          evidence,
          discoverySections,
        ),
      })),
    };
  }

  return receipt;
}

export function activePresent(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
): { callId: string; request: PresentRequest } | null {
  let last: { callId: string; request: PresentRequest } | null = null;

  for (const call of calls) {
    if (call.function.name !== PRESENT_RESPONSE_TOOL_NAME) continue;

    const parsed = parsePresentArguments(call.function.arguments);
    if (!parsed) continue;

    const content = toolMessageContent(results.get(call.id)?.content);
    if (content !== undefined && resultRejected(content)) continue;

    if (
      !requestHasPresentationIntent(parsed) &&
      last !== null &&
      requestHasPresentationIntent(last.request)
    ) {
      continue;
    }

    last = { callId: call.id, request: parsed };
  }

  return last;
}

export function resolvedBrowseCatalogCallId(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
  present: { request: PresentRequest } | null,
): string | undefined {
  if (present?.request.catalog?.mode !== "browse") {
    return undefined;
  }

  const snapshots = collectCatalogSearchSnapshots(calls, results);
  const claimedId = present.request.catalog.resultSetId;
  if (claimedId) {
    const match = snapshots.find((entry) => entry.callId === claimedId);
    if (match?.ok && match.kind !== "failure") {
      return claimedId;
    }
    return undefined;
  }

  return newestSuccessfulCourseSearchCallId(snapshots);
}

export function mountedCatalogCallIds(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
  running: boolean,
): Set<string> {
  const present = activePresent(calls, results);
  const browseId = resolvedBrowseCatalogCallId(calls, results, present);
  const mounted = new Set<string>();
  if (browseId && !running) {
    mounted.add(browseId);
  }
  return mounted;
}

export function courseCallIdentity(
  call: ToolCallLike,
  content: string | undefined,
): { argument: string; canonical: string | null } {
  const argument = readCallCode(call);
  let canonical: string | null = null;
  if (typeof content === "string") {
    const parsed = parseCourseDetailResult(content);
    if (parsed.kind === "course") {
      canonical = parsed.data.course.courseCode;
    }
  }
  return { argument, canonical };
}

export function sectionCallIdentity(
  call: ToolCallLike,
  content: string | undefined,
): { argument: string; canonical: string | null } {
  const argument = readCallCode(call);
  let canonical: string | null = null;
  if (typeof content === "string") {
    const parsed = parseCourseSectionsResult(content);
    if (parsed.kind === "sections") {
      canonical = parsed.data.courseCode;
    } else if (parsed.kind === "empty") {
      canonical = parsed.courseCode;
    }
  }
  return { argument, canonical };
}

function claimMatchesIdentity(
  claimCourse: string,
  identity: { argument: string; canonical: string | null },
): boolean {
  if (claimCourse === identity.argument) return true;
  if (identity.canonical !== null && claimCourse === identity.canonical) return true;
  return false;
}

function isClaimed(
  call: ToolCallLike,
  content: string | undefined,
  show: PresentShow[],
  component: PresentComponent,
  identityFn: (call: ToolCallLike, content: string | undefined) => {
    argument: string;
    canonical: string | null;
  },
): boolean {
  const identity = identityFn(call, content);
  return show.some(
    (claim) => claim.component === component && claimMatchesIdentity(claim.course, identity),
  );
}

function readFilterResultSetId(content: string | undefined): string | undefined {
  if (content === undefined) return undefined;
  try {
    const parsed = JSON.parse(content) as { resultSetId?: unknown; status?: unknown };
    if (parsed.status === "applied" && typeof parsed.resultSetId === "string") {
      return parsed.resultSetId;
    }
  } catch {
    // ignore
  }
  return undefined;
}

function shouldMountFilterRichBlock(
  content: string | undefined,
  mountedCatalogIds: Set<string>,
): boolean {
  if (content === undefined) return false;
  try {
    const parsed = JSON.parse(content) as { status?: unknown; resultSetId?: unknown };
    if (parsed.status === "applied") {
      return typeof parsed.resultSetId === "string" && mountedCatalogIds.has(parsed.resultSetId);
    }
    return parsed.status === "unknown_result_set" || parsed.status === "invalid_request";
  } catch {
    return false;
  }
}

export type PlanRichBlocksThreadContext = {
  calls: ToolCallLike[];
  results: Map<string, { content?: unknown }>;
};

export function planRichBlocks(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
  alwaysRichNames: ReadonlySet<string>,
  running: boolean,
  threadContext?: PlanRichBlocksThreadContext,
): RichBlock[] {
  const contextCalls = threadContext?.calls ?? calls;
  const contextResults = threadContext?.results ?? results;
  const present = activePresent(contextCalls, contextResults);
  const show = present?.request.show ?? [];
  const winners = claimedLookupWinners(calls, results, show);
  const browseCatalogCallId = resolvedBrowseCatalogCallId(contextCalls, contextResults, present);
  const mountedCatalogIds = mountedCatalogCallIds(contextCalls, contextResults, running);
  const blocks: RichBlock[] = [];

  for (const call of calls) {
    const name = call.function.name;
    if (name === PRESENT_RESPONSE_TOOL_NAME) continue;

    const content = toolMessageContent(results.get(call.id)?.content);
    const hasResult = content !== undefined;

    if (name === SEARCH_CATALOG_TOOL_NAME) {
      if (!running && browseCatalogCallId === call.id) {
        blocks.push({ kind: "tool", callId: call.id });
      }
      continue;
    }

    if (name === FILTER_CATALOG_RESULTS_TOOL_NAME) {
      if (!running && hasResult && shouldMountFilterRichBlock(content, mountedCatalogIds)) {
        blocks.push({ kind: "tool", callId: call.id });
      }
      continue;
    }

    if (alwaysRichNames.has(name)) {
      if (hasResult || running) {
        blocks.push({ kind: "tool", callId: call.id });
      }
      continue;
    }

    if (name === GET_COURSE_TOOL_NAME) {
      if (content !== undefined && clarificationAsk(content)) {
        blocks.push({ kind: "tool", callId: call.id });
        continue;
      }
      if (
        isClaimed(call, content, show, "course_detail", courseCallIdentity) &&
        winners.course.get(courseDedupeKey(call, content)) === call.id
      ) {
        blocks.push({ kind: "tool", callId: call.id });
      }
      continue;
    }

    if (name === GET_COURSE_SECTIONS_TOOL_NAME) {
      if (
        isClaimed(call, content, show, "course_sections", sectionCallIdentity) &&
        winners.sections.get(sectionDedupeKey(call, content)) === call.id
      ) {
        blocks.push({ kind: "tool", callId: call.id });
      }
    }
  }

  if (!running && present) {
    const requested = present.request.recommendations?.courses ?? [];
    if (requested.length > 0) {
      const validated = activeRecommendationCourses(contextCalls, contextResults);
      if (validated.length === requested.length) {
        const requestedSections = present.request.recommendations?.sections ?? {};
        const sections: Record<string, string> = {};
        for (const course of validated) {
          const section = requestedSections[course];
          if (section !== undefined) {
            sections[course] = section;
          }
        }
        blocks.push({
          kind: "recommendations",
          presentCallId: present.callId,
          courses: validated,
          sections,
        });
      }
    }
  }

  return blocks;
}

export function callsForActivity<T extends ToolCallLike>(calls: readonly T[]): T[] {
  return calls.filter((call) => call.function.name !== PRESENT_RESPONSE_TOOL_NAME);
}

export function activeRecommendationCourses(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
): string[] {
  const present = activePresent(calls, results);
  const courses = present?.request.recommendations?.courses ?? [];
  if (courses.length === 0) return [];

  const requestedSections = present?.request.recommendations?.sections ?? {};
  const discovery = discoveryEvidenceFromCalls(calls, results);
  const discoverySections = new Map<string, Set<string>>();
  for (const [code, entry] of discovery) {
    discoverySections.set(code, new Set(entry.sections.keys()));
  }

  const evidence = new Set<string>();
  for (const call of calls) {
    if (call.function.name === GET_COURSE_TOOL_NAME) {
      const content = toolMessageContent(results.get(call.id)?.content);
      const identity = courseCallIdentity(call, content);
      if (lookupOk(GET_COURSE_TOOL_NAME, content)) {
        evidence.add(identity.canonical ?? identity.argument);
      }
    }
  }
  for (const snapshot of collectCatalogSearchSnapshots(calls, results)) {
    for (const course of snapshot.courses) {
      evidence.add(course.courseCode.trim().toUpperCase());
    }
  }
  for (const code of discovery.keys()) {
    evidence.add(code);
  }

  return courses.filter((course) =>
    recommendationEligibilityForCode(
      course,
      requestedSections[course],
      evidence,
      discoverySections,
    ) === "ready",
  );
}

export function turnHasHiddenCatalogResearch(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
  running: boolean,
): boolean {
  const snapshots = collectCatalogSearchSnapshots(calls, results);
  if (snapshots.length === 0) return false;
  const browseId = resolvedBrowseCatalogCallId(calls, results, activePresent(calls, results));
  if (running) {
    return snapshots.length > 0;
  }
  if (!browseId) {
    return snapshots.some((entry) => entry.ok);
  }
  return snapshots.some((entry) => entry.callId !== browseId && entry.ok);
}
