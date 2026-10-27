import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";
import { parseCourseDetailResult, GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import {
  GET_COURSE_SECTIONS_TOOL_NAME,
  parseCourseSectionsResult,
} from "@/lib/assistant/course-sections-ui";
import { collectCatalogSearchSnapshots, visibleMountedCatalogCallIds } from "@/lib/assistant/catalog-research";
import {
  planRichBlocks,
  turnHasHiddenCatalogResearch,
  type ToolCallLike,
} from "@/lib/assistant/presentation";
import { ALWAYS_RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import { parseSearchCatalogResult, SEARCH_CATALOG_TOOL_NAME } from "@/lib/assistant/search-catalog-ui";
import {
  parseTimetablePreviewResult,
  PREVIEW_TIMETABLE_TOOL_NAME,
} from "@/lib/assistant/timetable-preview";

export { VISIBLE_BLOCKS_CONTEXT_DESCRIPTION } from "@/lib/assistant/visible-blocks-context";
export type {
  VisibleBlock,
  VisibleBlocksPayload,
} from "@/lib/assistant/visible-blocks-context";

import type {
  VisibleBlock,
  VisibleBlocksPayload,
} from "@/lib/assistant/visible-blocks-context";

export const MAX_VISIBLE_BLOCKS_CONTEXT_CHARS = 900;

function userMessageIndices(messages: readonly DiscussedMessage[]): number[] {
  const indices: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") {
      indices.push(index);
    }
  }
  return indices;
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (part !== null && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
          return (part as { text: string }).text;
        }
        return "";
      })
      .join("");
  }
  return "";
}

function hasAssistantOutput(
  messages: readonly DiscussedMessage[],
  startIndex: number,
  endIndex: number,
): boolean {
  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    if (textOf(message.content).trim()) return true;
    if (message.toolCalls?.length) return true;
  }
  return false;
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

      if (!byId.has(id)) {
        order.push(id);
      }
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
    if (message?.role !== "tool" || typeof message.toolCallId !== "string") continue;
    results.set(message.toolCallId, { content: message.content });
  }
  return results;
}

function toVisibleBlock(call: ToolCallLike, content: string | undefined): VisibleBlock | null {
  if (content === undefined) return null;

  switch (call.function.name) {
    case GET_COURSE_TOOL_NAME: {
      const parsed = parseCourseDetailResult(content);
      if (parsed.kind !== "course") return null;
      return { kind: "course_detail", course: parsed.data.course.courseCode.trim().toUpperCase() };
    }
    case GET_COURSE_SECTIONS_TOOL_NAME: {
      const parsed = parseCourseSectionsResult(content);
      if (parsed.kind === "sections") {
        return {
          kind: "course_sections",
          course: parsed.data.courseCode.trim().toUpperCase(),
          instructor: parsed.data.instructor,
          sectionCount: parsed.data.sections.length,
        };
      }
      if (parsed.kind === "empty") {
        return {
          kind: "course_sections",
          course: parsed.courseCode.trim().toUpperCase(),
          instructor: parsed.instructor,
          sectionCount: 0,
        };
      }
      return null;
    }
    case SEARCH_CATALOG_TOOL_NAME: {
      const parsed = parseSearchCatalogResult(content);
      if (parsed.kind === "courses") {
        return { kind: "course_list", count: parsed.totalCount };
      }
      if (parsed.kind === "instructors") {
        return { kind: "instructor_list", count: parsed.totalCount };
      }
      return null;
    }
    case PREVIEW_TIMETABLE_TOOL_NAME: {
      const parsed = parseTimetablePreviewResult(content);
      if (parsed.kind !== "result" || parsed.data.status !== "ready") return null;
      if (parsed.data.kind === "saved" || parsed.data.kind === "hypothetical") {
        return { kind: "timetable_preview", preview: parsed.data.kind };
      }
      return null;
    }
    default:
      return null;
  }
}

function blocksForTurn(
  messages: readonly DiscussedMessage[],
  startIndex: number,
  endIndex: number,
): VisibleBlock[] {
  const calls = collectTurnCalls(messages, startIndex, endIndex);
  if (calls.length === 0) return [];

  const results = collectTurnResults(messages, startIndex, endIndex);
  const planned = planRichBlocks(calls, results, ALWAYS_RICH_TOOL_NAMES, false);
  const callById = new Map(calls.map((entry) => [entry.id, entry]));

  const blocks: VisibleBlock[] = [];
  for (const block of planned) {
    if (block.kind === "recommendations") {
      blocks.push({ kind: "recommendations", courses: [...block.courses] });
      continue;
    }
    const call = callById.get(block.callId);
    if (!call) continue;
    const rawContent = results.get(block.callId)?.content;
    const content = typeof rawContent === "string" ? rawContent : undefined;
    const visible = toVisibleBlock(call, content);
    if (visible) {
      blocks.push(visible);
    }
  }

  if (turnHasHiddenCatalogResearch(calls, results, false)) {
    const searchCount = collectCatalogSearchSnapshots(calls, results).length;
    if (searchCount > 0) {
      blocks.push({ kind: "research_summary", searchCount });
    }
  }

  return blocks;
}

export { visibleMountedCatalogCallIds };

export function summarizeVisibleBlocks(messages: readonly DiscussedMessage[]): string {
  const userIndices = userMessageIndices(messages);
  if (userIndices.length === 0) {
    return JSON.stringify({ latestTurn: 0, turns: [] } satisfies VisibleBlocksPayload);
  }

  const turnsWithOutput: VisibleBlocksPayload["turns"] = [];
  for (let turnIndex = 0; turnIndex < userIndices.length; turnIndex += 1) {
    const startIndex = userIndices[turnIndex]!;
    const endIndex =
      turnIndex + 1 < userIndices.length ? userIndices[turnIndex + 1]! : messages.length;
    if (!hasAssistantOutput(messages, startIndex, endIndex)) continue;
    turnsWithOutput.push({
      turn: turnIndex + 1,
      blocks: blocksForTurn(messages, startIndex, endIndex),
    });
  }

  const payload: VisibleBlocksPayload = {
    latestTurn: userIndices.length,
    turns: turnsWithOutput.slice(-3).reverse(),
  };

  let serialized = JSON.stringify(payload);
  while (serialized.length > MAX_VISIBLE_BLOCKS_CONTEXT_CHARS && payload.turns.length > 1) {
    payload.turns.pop();
    serialized = JSON.stringify(payload);
  }

  return serialized;
}
