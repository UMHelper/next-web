import { GET_COURSE_TOOL_NAME, parseCourseDetailResult } from "@/lib/assistant/course-detail-ui";
import { activeRecommendationCourses, type ToolCallLike } from "@/lib/assistant/presentation";
import { SEARCH_CATALOG_TOOL_NAME } from "@/lib/assistant/search-catalog-ui";

export const DISCUSSED_COURSES_CONTEXT_DESCRIPTION =
  "Courses already retrieved in this chat, newest turn first. order is the student's mention order when the message named two or more codes; otherwise tool-result order. Use for follow-up ordinals when no catalog result set is newer";

export const MAX_DISCUSSED_CONTEXT_CHARS = 1200;

export type DiscussedCoursesPayload = {
  active: null | { id: string; order: string[]; newerThanCatalog: true };
  turns: Array<{ id: string; order: string[] }>;
};

export type DiscussedMessage = {
  role: string;
  content?: unknown;
  toolCalls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
  toolCallId?: string;
};

const COURSE_CODE_PATTERN = /[A-Z]{4}\d{4}/;

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

function explicitCodes(text: string): string[] {
  return text.toUpperCase().match(/[A-Z]{4}\d{4}/g) ?? [];
}

function userMessageIndices(messages: readonly DiscussedMessage[]): number[] {
  const indices: number[] = [];
  for (let index = 0; index < messages.length; index++) {
    if (messages[index].role === "user") {
      indices.push(index);
    }
  }
  return indices;
}

function lastSearchCatalogIndex(messages: readonly DiscussedMessage[]): number {
  let last = -1;
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index];
    if (message.role !== "assistant" || !message.toolCalls?.length) {
      continue;
    }
    for (const call of message.toolCalls) {
      if (call.function?.name === SEARCH_CATALOG_TOOL_NAME) {
        last = index;
      }
    }
  }
  return last;
}

function recommendationOrderForTurn(
  messages: readonly DiscussedMessage[],
  startIndex: number,
  endIndex: number,
): string[] {
  const byId = new Map<string, ToolCallLike>();
  const order: string[] = [];
  const results = new Map<string, { content?: unknown }>();

  for (let index = startIndex + 1; index < endIndex; index += 1) {
    const message = messages[index];
    if (message?.role === "tool" && typeof message.toolCallId === "string") {
      results.set(message.toolCallId, { content: message.content });
    }
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

  return activeRecommendationCourses(
    order.map((id) => byId.get(id)!),
    results,
  );
}

function lastRecommendationOrderBefore(messages: readonly DiscussedMessage[], beforeIndex: number): string[] {
  const userIndices = userMessageIndices(messages);
  for (let turnIndex = userIndices.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const startIndex = userIndices[turnIndex]!;
    if (startIndex >= beforeIndex) continue;
    const endIndex = turnIndex + 1 < userIndices.length ? userIndices[turnIndex + 1]! : messages.length;
    const order = recommendationOrderForTurn(messages, startIndex, endIndex);
    if (order.length > 0) return order;
  }
  return [];
}

function validatedCodesForTurn(
  messages: readonly DiscussedMessage[],
  startIndex: number,
  endIndex: number,
): string[] {
  const recommendationOrder = recommendationOrderForTurn(messages, startIndex, endIndex);
  if (recommendationOrder.length >= 2) {
    return recommendationOrder.slice(0, 3);
  }

  const toolResultById = new Map<string, string>();
  for (let index = startIndex + 1; index < endIndex; index++) {
    const message = messages[index];
    if (message.role === "tool" && typeof message.toolCallId === "string") {
      toolResultById.set(message.toolCallId, typeof message.content === "string" ? message.content : "");
    }
  }

  const codes: string[] = [];
  for (let index = startIndex + 1; index < endIndex; index++) {
    const message = messages[index];
    if (message.role !== "assistant" || !message.toolCalls?.length) {
      continue;
    }
    for (const call of message.toolCalls) {
      if (call.function?.name !== GET_COURSE_TOOL_NAME || typeof call.id !== "string") {
        continue;
      }
      const content = toolResultById.get(call.id);
      if (content === undefined) {
        continue;
      }
      const parsed = parseCourseDetailResult(content);
      if (parsed.kind !== "course") {
        continue;
      }
      const normalized = parsed.data.course.courseCode.trim().toUpperCase();
      if (COURSE_CODE_PATTERN.test(normalized)) {
        codes.push(normalized.match(COURSE_CODE_PATTERN)![0]);
      }
    }
  }
  if (codes.length >= 2) {
    return codes.slice(0, 3);
  }

  if (recommendationOrder.length === 1 && codes.length === 0) {
    return recommendationOrder.slice(0, 3);
  }

  return codes;
}

function buildTurnOrder(userText: string, validatedInCallOrder: string[]): string[] {
  const validatedSet = new Set(validatedInCallOrder);
  const mentioned = explicitCodes(userText).filter((code) => validatedSet.has(code));

  if (mentioned.length >= 2) {
    const order = [...mentioned];
    for (const code of validatedInCallOrder) {
      if (!order.includes(code)) {
        order.push(code);
      }
    }
    return order.slice(0, 3);
  }

  if (
    mentioned.length === 1 &&
    validatedInCallOrder.length === 2 &&
    validatedInCallOrder.includes(mentioned[0])
  ) {
    const other = validatedInCallOrder.find((code) => code !== mentioned[0])!;
    return [other, mentioned[0]].slice(0, 3);
  }

  return validatedInCallOrder.slice(0, 3);
}

export function summarizeDiscussedCourses(messages: readonly DiscussedMessage[]): string {
  const userIndices = userMessageIndices(messages);
  const lastCatalogIndex = lastSearchCatalogIndex(messages);
  const turns: DiscussedCoursesPayload["turns"] = [];

  for (let turnIndex = userIndices.length - 1; turnIndex >= 0; turnIndex--) {
    const startIndex = userIndices[turnIndex];
    const endIndex = turnIndex + 1 < userIndices.length ? userIndices[turnIndex + 1] : messages.length;
    const validated = validatedCodesForTurn(messages, startIndex, endIndex);
    if (validated.length < 2) {
      continue;
    }
    const userText = textOf(messages[startIndex].content);
    turns.push({
      id: `turn-${startIndex}`,
      order: buildTurnOrder(userText, validated),
    });
    if (turns.length >= 2) {
      break;
    }
  }

  let active: DiscussedCoursesPayload["active"] = null;
  if (userIndices.length > 0) {
    const latestStart = userIndices[userIndices.length - 1]!;
    const latestEnd = messages.length;
    let recommendationOrder = recommendationOrderForTurn(messages, latestStart, latestEnd);
    if (recommendationOrder.length === 0) {
      recommendationOrder = lastRecommendationOrderBefore(messages, latestStart);
    }
    if (recommendationOrder.length > 0) {
      active = {
        id: `rec-${latestStart}`,
        order: recommendationOrder.slice(0, 5),
        newerThanCatalog: true,
      };
    } else if (turns.length > 0) {
      const newest = turns[0];
      const newestUserIndex = Number.parseInt(newest.id.slice("turn-".length), 10);
      if (newestUserIndex > lastCatalogIndex) {
        active = { id: newest.id, order: newest.order, newerThanCatalog: true };
      }
    }
  }

  const payload: DiscussedCoursesPayload = { active, turns };
  let serialized = JSON.stringify(payload);
  while (serialized.length > MAX_DISCUSSED_CONTEXT_CHARS && payload.turns.length > 1) {
    payload.turns.pop();
    if (payload.active && payload.turns.every((turn) => turn.id !== payload.active!.id)) {
      payload.active = null;
    }
    serialized = JSON.stringify(payload);
  }

  return serialized;
}
