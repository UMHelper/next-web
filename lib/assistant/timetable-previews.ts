import type { DiscussedMessage } from "@/lib/assistant/discussed-courses";
import {
  PREVIEW_TIMETABLE_TOOL_NAME,
  parseTimetablePreviewResult,
  type TimetablePreviewResult,
} from "@/lib/assistant/timetable-preview";
import { sectionLabel, type AnalyzedConflict } from "@/lib/timetable/analysis";

export const TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION =
  "Timetable previews already shown in this chat, newest first. They are snapshots: hypothetical ones were never saved, and stale ones were built from an older version of the timetable. For the student's real timetable use the timetable context";

export const MAX_PREVIEWS_CONTEXT_CHARS = 1200;

type TimetablePreviewSummary = {
  id: string;
  kind: "saved" | "hypothetical";
  added: string[];
  replaced: string[];
  conflicts: string[];
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

function isStale(previewVersion: string | null, currentVersion: string | null): boolean {
  return previewVersion !== currentVersion;
}

function summarizeReadyPreview(
  toolCallId: string,
  preview: Extract<TimetablePreviewResult, { status: "ready" }>,
  currentVersion: string | null,
): TimetablePreviewSummary {
  return {
    id: `preview-${toolCallId}`,
    kind: preview.kind,
    added: preview.sections.filter((section) => section.origin === "added").map(sectionLabel),
    replaced: preview.replaced,
    conflicts: preview.facts.conflicts.map(formatConflict),
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
