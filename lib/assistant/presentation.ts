import { parseCourseDetailResult, GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import { clarificationAsk } from "@/lib/assistant/course-referent";
import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";
import {
  GET_COURSE_SECTIONS_TOOL_NAME,
  parseCourseSectionsResult,
} from "@/lib/assistant/course-sections-ui";

export const PRESENT_RESPONSE_TOOL_NAME = "present_response";
export const MAX_PRESENT_SHOW_ITEMS = 3;

export type PresentComponent = "course_detail" | "course_sections";
export type PresentShow = { component: PresentComponent; course: string };
export type PresentRequest = { show: PresentShow[] };
export type PresentEligibility = "ready" | "missing_lookup" | "lookup_failed";
export type PresentReceipt =
  | { status: "requested"; items: Array<PresentShow & { eligibility: PresentEligibility }>; note: string }
  | { status: "rejected"; reason: "invalid_request" };
export type LookupRecord = { component: PresentComponent; argument: string; canonical: string | null; ok: boolean };
export type PresentationLedger = { lookups: LookupRecord[]; pending: Set<Promise<unknown>> };
export type PresentationSlot = { current: PresentationLedger };
export type ToolCallLike = { id: string; function: { name: string; arguments: string } };
export type RichBlock = { kind: "tool"; callId: string };

export const PRESENT_RECEIPT_NOTE =
  "ready means the chat will display this card with your reply; it does not confirm the student has seen it, so never describe it as shown above. missing_lookup means no matching lookup ran in this turn: call get_course or get_course_sections for that course first, then present again, or answer in text. lookup_failed means the lookup did not return data, so no card will appear.";

const COURSE_CODE_RE = /^[A-Z]{4}\d{4}$/;
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
    const rawContent = results.get(call.id)?.content;
    const content = typeof rawContent === "string" ? rawContent : undefined;

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

export function createPresentationLedger(): PresentationLedger {
  return { lookups: [], pending: new Set() };
}

export function parsePresentRequest(args: unknown): PresentRequest | null {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }

  const record = args as Record<string, unknown>;
  const show = record.show;

  if (show === undefined) {
    if (Object.keys(record).length === 0) {
      return { show: [] };
    }
    return null;
  }

  if (!Array.isArray(show)) {
    return null;
  }

  const seen = new Set<string>();
  const normalized: PresentShow[] = [];

  for (const item of show) {
    if (normalized.length >= MAX_PRESENT_SHOW_ITEMS) {
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
    normalized.push({ component: entry.component as PresentComponent, course });
  }

  return { show: normalized };
}

export function parsePresentArguments(argumentsJson: string): PresentRequest | null {
  try {
    return parsePresentRequest(JSON.parse(argumentsJson));
  } catch {
    return null;
  }
}

function lookupOk(toolName: string, content: string | undefined): boolean {
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
      if (
        (name !== GET_COURSE_TOOL_NAME && name !== GET_COURSE_SECTIONS_TOOL_NAME) ||
        typeof argumentsJson !== "string" ||
        typeof id !== "string"
      ) {
        continue;
      }
      const record = lookupRecordFor(name, argumentsJson, toolContent.get(id));
      if (record) {
        ledger.lookups.push(record);
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

export async function executePresentResponse(
  args: unknown,
  ledger: PresentationLedger,
): Promise<PresentReceipt> {
  await Promise.allSettled(ledger.pending);

  const request = parsePresentRequest(args);
  if (!request) {
    return { status: "rejected", reason: "invalid_request" };
  }

  return {
    status: "requested",
    items: request.show.map((item) => ({
      ...item,
      eligibility: eligibilityForItem(item, ledger),
    })),
    note: PRESENT_RECEIPT_NOTE,
  };
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

    const rawContent = results.get(call.id)?.content;
    const content = typeof rawContent === "string" ? rawContent : undefined;
    if (content !== undefined && resultRejected(content)) continue;

    if (parsed.show.length === 0 && last !== null && last.request.show.length > 0) {
      continue;
    }

    last = { callId: call.id, request: parsed };
  }

  return last;
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

export function planRichBlocks(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
  alwaysRichNames: ReadonlySet<string>,
  running: boolean,
): RichBlock[] {
  const present = activePresent(calls, results);
  const show = present?.request.show ?? [];
  const winners = claimedLookupWinners(calls, results, show);
  const blocks: RichBlock[] = [];

  for (const call of calls) {
    const name = call.function.name;
    if (name === PRESENT_RESPONSE_TOOL_NAME) continue;

    const rawContent = results.get(call.id)?.content;
    const content = typeof rawContent === "string" ? rawContent : undefined;
    const hasResult = content !== undefined;

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

  return blocks;
}

export function callsForActivity<T extends ToolCallLike>(calls: readonly T[]): T[] {
  return calls.filter((call) => call.function.name !== PRESENT_RESPONSE_TOOL_NAME);
}
