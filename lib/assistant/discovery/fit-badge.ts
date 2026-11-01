import type { DiscoverySectionEvidence } from "@/lib/assistant/discovery/evidence";

export type FitBadge = { label: string; tone: "ok" | "warn" | "muted" };

function plannerVersionsMatch(
  evidenceVersion: string | null,
  currentPlannerVersion: string | null,
): boolean {
  return currentPlannerVersion !== null && evidenceVersion === currentPlannerVersion;
}

export function fitBadge(
  evidence: Pick<DiscoverySectionEvidence, "fit" | "plannerVersion" | "clashWith">,
  currentPlannerVersion: string | null,
): FitBadge | null {
  if (evidence.fit === "not_checked") return null;

  if (evidence.fit === "incomplete") {
    return { label: "Class times incomplete", tone: "muted" };
  }

  if (!plannerVersionsMatch(evidence.plannerVersion, currentPlannerVersion)) {
    return { label: "Timetable changed – ask me to re-check", tone: "warn" };
  }

  if (evidence.fit === "verified_no_clash") {
    return { label: "No clash with saved timetable", tone: "ok" };
  }

  if (evidence.fit === "confirmed_clash") {
    const clash = evidence.clashWith[0];
    if (!clash) {
      return { label: "Timetable changed – ask me to re-check", tone: "warn" };
    }
    return { label: `Clashes with ${clash}`, tone: "warn" };
  }

  return null;
}

const MEETING_PATTERN = /^([A-Z]{3})\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})/;

function meetingTimeKey(entry: string): string | null {
  const trimmed = entry.trim();
  const match = trimmed.match(MEETING_PATTERN);
  if (!match) return null;
  return `${match[2]}–${match[3]}`;
}

function meetingDay(entry: string): string | null {
  const match = entry.trim().match(MEETING_PATTERN);
  return match?.[1] ?? null;
}

export function formatMeetingSummary(meetings: string[]): string {
  if (meetings.length === 0) return "";

  const groups = new Map<string, string[]>();
  const order: string[] = [];

  for (const meeting of meetings) {
    const timeKey = meetingTimeKey(meeting);
    const day = meetingDay(meeting);
    if (!timeKey || !day) {
      order.push(meeting.trim());
      continue;
    }
    const key = timeKey;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(day);
  }

  const parts: string[] = [];
  for (const key of order) {
    const days = groups.get(key);
    if (days) {
      parts.push(`${days.join(", ")} ${key}`);
    } else {
      parts.push(key);
    }
  }

  return parts.join(" · ");
}
