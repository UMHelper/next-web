import type { CatalogCourse } from "@/lib/mcp/schemas";

import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";
import { planRichBlocks, type ToolCallLike } from "@/lib/assistant/presentation";
import { parseSearchCatalogResult, SEARCH_CATALOG_TOOL_NAME } from "@/lib/assistant/search-catalog-ui";
import { PREVIEW_TIMETABLE_TOOL_NAME } from "@/lib/assistant/timetable-preview";

const ALWAYS_RICH_FOR_PLAN = new Set([PREVIEW_TIMETABLE_TOOL_NAME]);

function userMessageIndices(messages: readonly DiscussedMessage[]): number[] {
  const indices: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") indices.push(index);
  }
  return indices;
}

function collectTurnCalls(
  messages: readonly DiscussedMessage[],
  startIndex: number,
  endIndex: number,
): ToolCallLike[] {
  const byId = new Map<string, ToolCallLike>();
  const order: string[] = [];
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant" || !message.toolCalls?.length) continue;
    for (const toolCall of message.toolCalls) {
      const id = toolCall.id;
      const name = toolCall.function?.name;
      const argumentsJson = toolCall.function?.arguments;
      if (typeof id !== "string" || typeof name !== "string") continue;
      if (!byId.has(id)) order.push(id);
      byId.set(id, {
        id,
        function: {
          name,
          arguments: typeof argumentsJson === "string" ? argumentsJson : "{}",
        },
      });
    }
  }
  return order.map((id) => byId.get(id)!);
}

function collectTurnResults(
  messages: readonly DiscussedMessage[],
  startIndex: number,
  endIndex: number,
): Map<string, { content?: unknown }> {
  const results = new Map<string, { content?: unknown }>();
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const message = messages[index];
    if (message?.role === "tool" && typeof message.toolCallId === "string") {
      results.set(message.toolCallId, { content: message.content });
    }
  }
  return results;
}

export function visibleMountedCatalogCallIds(messages: readonly DiscussedMessage[]): Set<string> {
  const ids = new Set<string>();
  const userIndices = userMessageIndices(messages);
  for (let turnIndex = 0; turnIndex < userIndices.length; turnIndex += 1) {
    const startIndex = userIndices[turnIndex]!;
    const endIndex =
      turnIndex + 1 < userIndices.length ? userIndices[turnIndex + 1]! : messages.length;
    const calls = collectTurnCalls(messages, startIndex, endIndex);
    const results = collectTurnResults(messages, startIndex, endIndex);
    const planned = planRichBlocks(calls, results, ALWAYS_RICH_FOR_PLAN, false);
    const callById = new Map(calls.map((entry) => [entry.id, entry]));
    for (const block of planned) {
      if (block.kind !== "tool") continue;
      const call = callById.get(block.callId);
      if (call?.function.name === SEARCH_CATALOG_TOOL_NAME) {
        ids.add(block.callId);
      }
    }
  }
  return ids;
}

export type CatalogSearchSnapshot = {
  callId: string;
  query?: string;
  ok: boolean;
  kind: "courses" | "instructors" | "empty" | "failure";
  totalCount: number;
  courses: CatalogCourse[];
};

export function readSearchQuery(argumentsJson: string): string | undefined {
  try {
    const args = JSON.parse(argumentsJson) as unknown;
    if (args !== null && typeof args === "object" && !Array.isArray(args)) {
      const query = (args as { query?: unknown }).query;
      if (typeof query === "string" && query.trim()) {
        return query.trim();
      }
    }
  } catch {
    // ignore
  }
  return undefined;
}

export function snapshotCatalogSearch(
  call: ToolCallLike,
  content: string | undefined,
): CatalogSearchSnapshot {
  const query = readSearchQuery(call.function.arguments);
  if (content === undefined) {
    return { callId: call.id, query, ok: false, kind: "failure", totalCount: 0, courses: [] };
  }
  const parsed = parseSearchCatalogResult(content);
  if (parsed.kind === "failure") {
    return { callId: call.id, query, ok: false, kind: "failure", totalCount: 0, courses: [] };
  }
  if (parsed.kind === "empty") {
    return { callId: call.id, query, ok: true, kind: "empty", totalCount: 0, courses: [] };
  }
  if (parsed.kind === "instructors") {
    return {
      callId: call.id,
      query,
      ok: true,
      kind: "instructors",
      totalCount: parsed.totalCount,
      courses: [],
    };
  }
  return {
    callId: call.id,
    query,
    ok: true,
    kind: "courses",
    totalCount: parsed.totalCount,
    courses: parsed.courses,
  };
}

export function collectCatalogSearchSnapshots(
  calls: readonly ToolCallLike[],
  results: Map<string, { content?: unknown }>,
): CatalogSearchSnapshot[] {
  const snapshots: CatalogSearchSnapshot[] = [];
  for (const call of calls) {
    if (call.function.name !== SEARCH_CATALOG_TOOL_NAME) continue;
    const raw = results.get(call.id)?.content;
    const content = typeof raw === "string" ? raw : undefined;
    snapshots.push(snapshotCatalogSearch(call, content));
  }
  return snapshots;
}

export function newestSuccessfulCourseSearchCallId(
  snapshots: readonly CatalogSearchSnapshot[],
): string | undefined {
  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const entry = snapshots[index]!;
    if (entry.ok && entry.kind !== "failure" && entry.kind !== "instructors") {
      return entry.callId;
    }
  }
  return undefined;
}

export function mergeDedupedCourses(snapshots: readonly CatalogSearchSnapshot[]): CatalogCourse[] {
  const byCode = new Map<string, CatalogCourse>();
  for (const snapshot of snapshots) {
    for (const course of snapshot.courses) {
      const code = course.courseCode.trim().toUpperCase();
      if (!byCode.has(code)) {
        byCode.set(code, course);
      }
    }
  }
  return [...byCode.values()].sort((left, right) =>
    left.courseCode.localeCompare(right.courseCode),
  );
}

export function courseCodesFromTurnEvidence(
  calls: readonly ToolCallLike[],
  results: Map<string, { content?: unknown }>,
  ledgerCourseCodes: readonly string[],
): Set<string> {
  const codes = new Set<string>(ledgerCourseCodes);
  for (const snapshot of collectCatalogSearchSnapshots(calls, results)) {
    for (const course of snapshot.courses) {
      codes.add(course.courseCode.trim().toUpperCase());
    }
  }
  return codes;
}
