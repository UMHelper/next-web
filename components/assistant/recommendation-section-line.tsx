"use client";

import type { DiscoverySectionEvidence } from "@/lib/assistant/discovery/evidence";
import { fitBadge, formatMeetingSummary } from "@/lib/assistant/discovery/fit-badge";

import { usePlannerVersion } from "./planner-version-context";

const TONE_CLASS: Record<"ok" | "warn" | "muted", string> = {
  ok: "text-success",
  warn: "text-warning",
  muted: "text-muted-foreground",
};

export function RecommendationSectionLine({ evidence }: { evidence: DiscoverySectionEvidence }) {
  const currentPlannerVersion = usePlannerVersion();
  const badge = fitBadge(evidence, currentPlannerVersion);
  const meetings = formatMeetingSummary(evidence.meetings);
  const sectionLabel = `Sec ${evidence.section}`;

  return (
    <div
      data-section-line
      className="min-w-0 truncate px-1 pb-1.5 text-xs leading-snug text-muted-foreground"
    >
      <span className="truncate">
        {meetings ? `${sectionLabel} · ${meetings}` : sectionLabel}
      </span>
      {badge ? (
        <span className={`mt-0.5 block truncate ${TONE_CLASS[badge.tone]}`}>{badge.label}</span>
      ) : null}
    </div>
  );
}
