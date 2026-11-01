import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";
import {
  PREVIEW_TIMETABLE_TOOL_NAME,
  parseTimetablePreviewResult,
  type TimetablePreviewResult,
} from "@/lib/assistant/timetable-preview";
import { DAY_PARTS, sectionLabel, type AnalyzedConflict } from "@/lib/timetable/analysis";
import { timeToMinutes } from "@/lib/timetable/conflicts";

export const TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION =
  "Timetable previews already shown in this chat, newest first. They are snapshots: hypothetical ones were never saved, and stale ones were built from an older version of the timetable. For the student's real timetable use the timetable context. Each preview lists conflicts for the full hypothetical week, changeConflicts for clashes involving newly added sections, and morningConflicts for morning overlaps (from changeConflicts on hypothetical previews)";

export const MAX_PREVIEWS_CONTEXT_CHARS = 1200;

export type TimetablePreviewSummary = {
  id: string;
  kind: "saved" | "hypothetical";
  plannerVersionAtPreview: string | null;
  added: string[];
  replaced: string[];
  conflicts: string[];
  changeConflicts: string[];
  morningConflicts: string[];
  conflictCount: number;
  changeConflictCount: number;
  unscheduled: string[];
  stale: boolean;
};

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  return "";
}

function previewToolNames(messages: readonly DiscussedMessage[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    if (message.role !== "assistant" || !message.toolCalls) continue;
    for (const call of message.toolCalls) {
      const id = call.id;
      const name = call.function?.name;
      if (id && name) {
        names.set(id, name);
      }
    }
  }
  return names;
}

function formatConflict(conflict: AnalyzedConflict): string {
  return `${conflict.day} ${conflict.a} / ${conflict.b} ${conflict.overlap}`;
}

const overlapIntersectsMorning = (overlap: string): boolean => {
  const match = overlap.match(/(\d{2}:\d{2})-(\d{2}:\d{2})/);
  if (!match) return false;
  const start = timeToMinutes(match[1]);
  const end = timeToMinutes(match[2]);
  const morningStart = timeToMinutes(DAY_PARTS.morning.start);
  const morningEnd = timeToMinutes(DAY_PARTS.morning.end);
  return start < morningEnd && end > morningStart;
};

const morningConflictsFrom = (conflicts: AnalyzedConflict[]): string[] =>
  conflicts.filter((conflict) => overlapIntersectsMorning(conflict.overlap)).map(formatConflict);

const conflictTouchesAdded = (conflict: AnalyzedConflict, addedLabels: readonly string[]): boolean =>
  addedLabels.some((label) => conflict.a.includes(label) || conflict.b.includes(label));

const changeConflictsFrom = (
  preview: Extract<TimetablePreviewResult, { status: "ready" }>,
): AnalyzedConflict[] => {
  if (preview.kind !== "hypothetical") return [];
  const addedLabels = preview.sections.filter((section) => section.origin === "added").map(sectionLabel);
  if (addedLabels.length === 0) return [];
  return preview.facts.conflicts.filter((conflict) => conflictTouchesAdded(conflict, addedLabels));
};

function isStale(previewVersion: string | null, currentVersion: string | null): boolean {
  return previewVersion !== currentVersion;
}

function summarizeReadyPreview(
  toolCallId: string,
  preview: Extract<TimetablePreviewResult, { status: "ready" }>,
  currentVersion: string | null,
): TimetablePreviewSummary {
  const fullConflicts = preview.facts.conflicts;
  const changeConflicts = changeConflictsFrom(preview);
  const morningSource = preview.kind === "hypothetical" ? changeConflicts : fullConflicts;
  return {
    id: `preview-${toolCallId}`,
    kind: preview.kind,
    plannerVersionAtPreview: preview.version,
    added: preview.sections.filter((section) => section.origin === "added").map(sectionLabel),
    replaced: preview.replaced,
    conflicts: fullConflicts.map(formatConflict),
    changeConflicts: changeConflicts.map(formatConflict),
    morningConflicts: morningConflictsFrom(morningSource),
    conflictCount: fullConflicts.length,
    changeConflictCount: changeConflicts.length,
    unscheduled: preview.facts.unscheduled,
    stale: isStale(preview.version, currentVersion),
  };
}

function collectReadyPreviews(messages: readonly DiscussedMessage[]): Array<{
  toolCallId: string;
  preview: Extract<TimetablePreviewResult, { status: "ready" }>;
}> {
  const toolNames = previewToolNames(messages);
  const ready: Array<{
    toolCallId: string;
    preview: Extract<TimetablePreviewResult, { status: "ready" }>;
  }> = [];

  for (const message of messages) {
    if (message.role !== "tool" || !message.toolCallId) continue;
    if (toolNames.get(message.toolCallId) !== PREVIEW_TIMETABLE_TOOL_NAME) continue;
    const parsed = parseTimetablePreviewResult(textOf(message.content));
    if (parsed.kind !== "result" || parsed.data.status !== "ready") continue;
    ready.push({ toolCallId: message.toolCallId, preview: parsed.data });
  }

  return ready;
}

export function summarizeTimetablePreviews(
  messages: readonly DiscussedMessage[],
  currentVersion: string | null,
): string {
  const chronological = collectReadyPreviews(messages);
  let summaries = chronological
    .slice(-2)
    .reverse()
    .map(({ toolCallId, preview }) => summarizeReadyPreview(toolCallId, preview, currentVersion));

  let serialized = JSON.stringify({ previews: summaries });
  while (serialized.length > MAX_PREVIEWS_CONTEXT_CHARS && summaries.length > 0) {
    summaries.pop();
    serialized = JSON.stringify({ previews: summaries });
  }

  return serialized;
}
