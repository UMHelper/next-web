import { PREVIEW_TIMETABLE_TOOL_NAME, parseTimetablePreviewResult } from "@/lib/assistant/timetable-preview";
import { TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION } from "@/lib/assistant/timetable-previews";

export const TIMETABLE_SCENARIO_DESCRIPTION =
  "Which timetable scenario the student's latest message is about. Use only the matching facts; never blend saved and preview";

export type TimetablePreviewSummaryRef = {
  id: string;
  kind: "saved" | "hypothetical";
  stale: boolean;
};

export type TimetableScenarioReferent =
  | { kind: "saved"; plannerVersion: string; wording?: string }
  | {
      kind: "preview";
      previewId: string;
      previewKind: "saved" | "hypothetical";
      stale: boolean;
      wording?: string;
    }
  | { kind: "ambiguous"; ask: string };

const SAVED_EXPLICIT =
  /\b(actual|real|saved)\s+timetable\b|\bmy\s+(?:actual|real|saved)\b|\bnot\s+the\s+preview\b|实际|保存|真(?:实|正)/i;
const PREVIEW_EXPLICIT =
  /\b(that|the)\s+(?:preview|option|scenario)\b|\bin\s+that\s+preview\b|那个预览|这(?:个|份)预览/i;
const CLASH_STATUS =
  /\b(?:still|any)\s+(?:have\s+)?(?:clashes?|conflicts?)\b|\b(?:clashes?|conflicts?)\s+(?:left|remain(?:ing)?)\b|\bdo\s+i\s+still\b.*\b(?:clash|conflict)/i;
const DEICTIC_FOLLOWUP =
  /\bwhat\s+about\b|\bwould\s+that\b|\bin\s+that\b|\bmorning\b|\bafternoon\b|\bevening\b|\bon\s+(?:monday|tuesday|wednesday|thursday|friday|mon|tue|wed|thu|fri)\b/i;
const COMPARE_PREVIEWS = /\bwhich\s+(?:one|preview|option|scenario)\b|\b(?:those|the)\s+two\s+preview/i;
const VAGUE_THIS = /\bthis\s+(?:one|schedule|timetable|preview)\b|\bthat\s+schedule\b/i;

type ContextEntry = { description: string; value: string };
type RunMessage = {
  role: string;
  content?: unknown;
  toolCalls?: Array<{ id?: string; function?: { name?: string } }>;
  toolCallId?: string;
};

export type TimetableScenarioRunInput = {
  context?: ContextEntry[];
  messages: RunMessage[];
};

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

export function parsePreviewSummaries(value: string): TimetablePreviewSummaryRef[] {
  if (!value.startsWith("{")) return [];
  let raw: unknown;
  try {
    raw = JSON.parse(value);
  } catch {
    return [];
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return [];
  const previews = (raw as { previews?: unknown }).previews;
  if (!Array.isArray(previews)) return [];

  const out: TimetablePreviewSummaryRef[] = [];
  for (const entry of previews) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    if (typeof record.id !== "string" || (record.kind !== "saved" && record.kind !== "hypothetical")) continue;
    out.push({
      id: record.id,
      kind: record.kind,
      stale: record.stale === true,
    });
  }
  return out;
}

function latestUserText(messages: readonly RunMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return textOf(messages[i].content).trim();
    }
  }
  return "";
}

function lastReadyPreviewBeforeLatestUser(messages: readonly RunMessage[]): {
  kind: "saved" | "hypothetical";
  previewId: string;
} | null {
  let latestUserIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      latestUserIndex = i;
      break;
    }
  }
  if (latestUserIndex < 0) return null;

  const toolNames = new Map<string, string>();
  for (const message of messages.slice(0, latestUserIndex)) {
    if (message.role !== "assistant" || !message.toolCalls) continue;
    for (const call of message.toolCalls) {
      const id = call.id;
      const name = call.function?.name;
      if (id && name) toolNames.set(id, name);
    }
  }

  for (let i = latestUserIndex - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.role !== "tool" || !message.toolCallId) continue;
    if (toolNames.get(message.toolCallId) !== PREVIEW_TIMETABLE_TOOL_NAME) continue;
    const parsed = parseTimetablePreviewResult(textOf(message.content));
    if (parsed.kind !== "result" || parsed.data.status !== "ready") continue;
    return {
      kind: parsed.data.kind,
      previewId: `preview-${message.toolCallId}`,
    };
  }
  return null;
}

function hypotheticalPreviews(previews: readonly TimetablePreviewSummaryRef[]): TimetablePreviewSummaryRef[] {
  return previews.filter((preview) => preview.kind === "hypothetical");
}

function pickPreviewReferent(
  previews: readonly TimetablePreviewSummaryRef[],
  preferHypothetical: boolean,
): TimetablePreviewSummaryRef | null {
  if (previews.length === 0) return null;
  if (preferHypothetical) {
    const hypo = previews.find((preview) => preview.kind === "hypothetical" && !preview.stale);
    if (hypo) return hypo;
    const anyHypo = previews.find((preview) => preview.kind === "hypothetical");
    if (anyHypo) return anyHypo;
  }
  const fresh = previews.find((preview) => !preview.stale);
  return fresh ?? previews[0] ?? null;
}

function hypoPreviewWording(userText: string): string {
  if (/\b(?:morning|afternoon|evening)\b/i.test(userText)) {
    return "Answer from this preview's morningConflicts and changeConflicts for that previewId; do not use the saved timetable context conflicts list.";
  }
  if (/\ball\s+(?:conflicts?|clashes?)\b/i.test(userText)) {
    return "Answer from this preview's conflicts list (full hypothetical week) for that previewId; do not substitute the saved digest conflicts list.";
  }
  return "Answer from this preview entry (changeConflicts for changes from the add/replace, conflicts for the whole preview week when they ask broadly); do not attribute facts to the saved timetable. You may say the preview is not saved.";
}

function toPreviewReferent(
  preview: TimetablePreviewSummaryRef,
  userText: string,
): Extract<TimetableScenarioReferent, { kind: "preview" }> {
  return {
    kind: "preview",
    previewId: preview.id,
    previewKind: preview.kind,
    stale: preview.stale,
    ...(preview.kind === "hypothetical" ? { wording: hypoPreviewWording(userText) } : {}),
  };
}

function savedReferent(
  plannerVersion: string,
  text = "",
): Extract<TimetableScenarioReferent, { kind: "saved" }> {
  const base = { kind: "saved" as const, plannerVersion };
  if (CLASH_STATUS.test(text)) {
    return {
      ...base,
      wording:
        "Answer only from the timetable context conflicts list. If it is empty, say there are no conflicts and do not cite overlap times from earlier in the chat.",
    };
  }
  return base;
}

export function timetableScenarioFromRun(
  input: TimetableScenarioRunInput,
  savedPlannerVersion: string,
): TimetableScenarioReferent {
  const version = savedPlannerVersion || "unknown";
  const previewsEntry = input.context?.find((entry) => entry.description === TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION);
  const previews = previewsEntry ? parsePreviewSummaries(previewsEntry.value) : [];
  const text = latestUserText(input.messages);

  if (SAVED_EXPLICIT.test(text)) {
    return savedReferent(version, text);
  }

  if (PREVIEW_EXPLICIT.test(text)) {
    const picked = pickPreviewReferent(previews, true);
    if (picked) return toPreviewReferent(picked, text);
  }

  const hypos = hypotheticalPreviews(previews);
  if (COMPARE_PREVIEWS.test(text) && hypos.length >= 2) {
    return { kind: "ambiguous", ask: "Which preview do you mean—the first or the second scenario?" };
  }
  if (VAGUE_THIS.test(text) && previews.length >= 2) {
    return { kind: "ambiguous", ask: "Which timetable do you mean—your saved plan or one of the previews?" };
  }

  const lastPreview = lastReadyPreviewBeforeLatestUser(input.messages);
  if (lastPreview?.kind === "hypothetical" && DEICTIC_FOLLOWUP.test(text) && !SAVED_EXPLICIT.test(text)) {
    const match = previews.find((preview) => preview.id === lastPreview.previewId);
    if (match) return toPreviewReferent(match, text);
    return {
      kind: "preview",
      previewId: lastPreview.previewId,
      previewKind: "hypothetical",
      stale: false,
      wording: hypoPreviewWording(text),
    };
  }

  if (lastPreview?.kind === "saved" && DEICTIC_FOLLOWUP.test(text) && !SAVED_EXPLICIT.test(text)) {
    return savedReferent(version, text);
  }

  if (
    DEICTIC_FOLLOWUP.test(text) &&
    !SAVED_EXPLICIT.test(text) &&
    previews[0]?.kind === "hypothetical"
  ) {
    return toPreviewReferent(previews[0], text);
  }

  if (CLASH_STATUS.test(text) && !PREVIEW_EXPLICIT.test(text)) {
    return savedReferent(version, text);
  }

  if (PREVIEW_EXPLICIT.test(text) || (lastPreview && DEICTIC_FOLLOWUP.test(text))) {
    const picked = pickPreviewReferent(previews, lastPreview?.kind === "hypothetical");
    if (picked && PREVIEW_EXPLICIT.test(text)) return toPreviewReferent(picked, text);
  }

  return savedReferent(version, text);
}
