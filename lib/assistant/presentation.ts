import { parseCourseDetailResult, GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import { clarificationAsk } from "@/lib/assistant/course-referent";
import {
  GET_COURSE_SECTIONS_TOOL_NAME,
  parseCourseSectionsResult,
} from "@/lib/assistant/course-sections-ui";

export const PRESENT_RESPONSE_TOOL_NAME = "present_response";

export type PresentComponent = "course_detail" | "course_sections";
export type PresentShow = { component: PresentComponent; course: string };
export type PresentResponse =
  | { status: "accepted"; show: PresentShow[] }
  | { status: "rejected"; reason: string };
export type AcceptedPresent = { status: "accepted"; show: PresentShow[] };
export type ToolCallLike = { id: string; function: { name: string; arguments: string } };
export type RichBlock = { kind: "tool"; callId: string };

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

export function executePresentResponse(args: unknown): PresentResponse {
  if (args === null || typeof args !== "object" || Array.isArray(args)) {
    return { status: "rejected", reason: "invalid_request" };
  }

  const record = args as Record<string, unknown>;
  const show = record.show;

  if (show === undefined) {
    if (Object.keys(record).length === 0) {
      return { status: "accepted", show: [] };
    }
    return { status: "rejected", reason: "invalid_request" };
  }

  if (!Array.isArray(show)) {
    return { status: "rejected", reason: "invalid_request" };
  }

  const seen = new Set<string>();
  const normalized: PresentShow[] = [];

  for (const item of show) {
    if (normalized.length >= 3) {
      return { status: "rejected", reason: "invalid_request" };
    }
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { status: "rejected", reason: "invalid_request" };
    }
    const entry = item as { component?: unknown; course?: unknown };
    if (typeof entry.component !== "string" || !PRESENT_COMPONENTS.has(entry.component)) {
      return { status: "rejected", reason: "invalid_request" };
    }
    const course = normalizeCourseCode(entry.course);
    if (!course) {
      return { status: "rejected", reason: "invalid_request" };
    }
    const key = `${entry.component}:${course}`;
    if (seen.has(key)) {
      return { status: "rejected", reason: "invalid_request" };
    }
    seen.add(key);
    normalized.push({ component: entry.component as PresentComponent, course });
  }

  return { status: "accepted", show: normalized };
}

export function parsePresentArguments(argumentsJson: string): PresentResponse | null {
  try {
    return executePresentResponse(JSON.parse(argumentsJson));
  } catch {
    return null;
  }
}

export function activePresent(
  calls: ToolCallLike[],
  results: Map<string, { content?: unknown }>,
): { callId: string; request: AcceptedPresent } | null {
  let last: { callId: string; request: AcceptedPresent } | null = null;

  for (const call of calls) {
    if (call.function.name !== PRESENT_RESPONSE_TOOL_NAME) continue;

    const parsed = parsePresentArguments(call.function.arguments);
    if (!parsed || parsed.status === "rejected") continue;

    const rawContent = results.get(call.id)?.content;
    const content = typeof rawContent === "string" ? rawContent : undefined;
    if (content !== undefined && resultRejected(content)) continue;

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
      if (isClaimed(call, content, show, "course_detail", courseCallIdentity)) {
        blocks.push({ kind: "tool", callId: call.id });
      }
      continue;
    }

    if (name === GET_COURSE_SECTIONS_TOOL_NAME) {
      if (isClaimed(call, content, show, "course_sections", sectionCallIdentity)) {
        blocks.push({ kind: "tool", callId: call.id });
      }
    }
  }

  return blocks;
}

export function callsForActivity(calls: ToolCallLike[]): ToolCallLike[] {
  return calls.filter((call) => call.function.name !== PRESENT_RESPONSE_TOOL_NAME);
}
