import {
  CHECK_PLAN_CONFLICTS_TOOL_NAME,
  checkPlanConflictsResultSchema,
  type ConflictFit,
} from "@/lib/assistant/check-plan-conflicts";
import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";

export const CONFLICT_VERIFICATION_CONTEXT_DESCRIPTION =
  "Timetable clash checks already run in this chat for the saved plan. plannerVersion is the timetable version when the check ran; stale true means the saved plan changed since then—do not treat stale rows as current evidence. Only call a section conflict-free when it appears here with fit verified_no_clash, stale false, and plannerVersion matching the timetable context plan version. fit confirmed_clash means a verified overlap; incomplete means times were not fully checked; absence means not_checked—never claim verified_no_clash without a matching row.";

export const MAX_CONFLICT_VERIFICATION_CONTEXT_CHARS = 1200;

export type ConflictVerificationEntry = {
  course: string;
  instructor: string;
  section: string;
  fit: ConflictFit;
  plannerVersion: string;
  stale: boolean;
  turn: number;
};

export type ConflictVerificationPayload = {
  plannerVersion: string;
  checks: ConflictVerificationEntry[];
};

function userMessageIndices(messages: readonly DiscussedMessage[]): number[] {
  const indices: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    if (messages[index]?.role === "user") indices.push(index);
  }
  return indices;
}

function toolCallsById(messages: readonly DiscussedMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.toolCalls?.length) continue;
    for (const call of message.toolCalls) {
      if (typeof call.id === "string" && typeof call.function?.name === "string") {
        names.set(call.id, call.function.name);
      }
    }
  }
  return names;
}

function entriesFromMessages(
  messages: readonly DiscussedMessage[],
  currentPlannerVersion: string | null,
): ConflictVerificationEntry[] {
  const toolNames = toolCallsById(messages);
  const userIndices = userMessageIndices(messages);
  const turnForIndex = (messageIndex: number): number => {
    let turn = 0;
    for (const userIndex of userIndices) {
      if (userIndex <= messageIndex) turn += 1;
    }
    return turn || 1;
  };

  const entries: ConflictVerificationEntry[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "tool" || typeof message.toolCallId !== "string") continue;
    if (toolNames.get(message.toolCallId) !== CHECK_PLAN_CONFLICTS_TOOL_NAME) continue;
    if (typeof message.content !== "string") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(message.content);
    } catch {
      continue;
    }
    const result = checkPlanConflictsResultSchema.safeParse(parsed);
    if (!result.success || result.data.status !== "checked") continue;

    const { courseCode, instructor, plannerVersion, sections } = result.data;
    const stale =
      currentPlannerVersion !== null &&
      currentPlannerVersion !== "unknown" &&
      plannerVersion !== currentPlannerVersion;
    const turn = turnForIndex(index);

    for (const section of sections) {
      entries.push({
        course: courseCode.trim().toUpperCase(),
        instructor: instructor.trim(),
        section: section.section,
        fit: section.fit,
        plannerVersion,
        stale,
        turn,
      });
    }
  }

  return entries;
}

export function summarizeConflictVerifications(
  messages: readonly DiscussedMessage[],
  currentPlannerVersion: string | null,
): string {
  const checks = entriesFromMessages(messages, currentPlannerVersion);
  const deduped = new Map<string, ConflictVerificationEntry>();
  for (const entry of checks) {
    const key = `${entry.course}\0${entry.instructor}\0${entry.section}`;
    deduped.set(key, entry);
  }

  const payload: ConflictVerificationPayload = {
    plannerVersion: currentPlannerVersion ?? "unknown",
    checks: [...deduped.values()].slice(-12).reverse(),
  };

  let serialized = JSON.stringify(payload);
  while (serialized.length > MAX_CONFLICT_VERIFICATION_CONTEXT_CHARS && payload.checks.length > 1) {
    payload.checks.pop();
    serialized = JSON.stringify(payload);
  }

  return serialized;
}
