"use client";

import { useState } from "react";
import type { ToolCall, ToolMessage } from "@copilotkit/react-core/v2";

import { ToolRow } from "@/components/ai-elements/tool";
import { CatalogCourseRow } from "@/components/assistant/catalog-course-row";
import {
  applyCatalogFilter,
  describeLoadedResultSummary,
} from "@/lib/assistant/catalog-result-sets";
import {
  mergeDedupedCourses,
  collectCatalogSearchSnapshots,
  type CatalogSearchSnapshot,
} from "@/lib/assistant/catalog-research";
import type { RichBlock, ToolCallLike } from "@/lib/assistant/presentation";
import {
  callsForExpandedActivity,
  formatTurnActivityDetail,
  summarizeTurnActivityCounts,
  turnHasActivity,
} from "@/lib/assistant/turn-activity";
import { useCatalogFilter } from "@/components/assistant/catalog-filter-store";

const TOGGLE_CLASS =
  "inline-flex min-h-8 items-center rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function searchLabel(snapshot: CatalogSearchSnapshot): string {
  if (snapshot.query) return snapshot.query;
  return "catalog search";
}

export function AgentTurnActivity({
  calls,
  results,
  richPlan,
  isRunning,
  researchFilterKey,
}: {
  calls: ToolCall[];
  results: Map<string, ToolMessage>;
  richPlan: readonly RichBlock[];
  isRunning: boolean;
  researchFilterKey: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useCatalogFilter(researchFilterKey);

  const toolCalls = calls as ToolCallLike[];
  const resultMap = new Map<string, { content?: unknown }>();
  for (const [id, message] of results) {
    resultMap.set(id, { content: message.content });
  }

  if (!turnHasActivity(toolCalls)) return null;

  const expandedCalls = callsForExpandedActivity(toolCalls, richPlan);
  const counts = summarizeTurnActivityCounts(toolCalls, resultMap);
  const detail = formatTurnActivityDetail(counts);
  const snapshots = collectCatalogSearchSnapshots(toolCalls, resultMap);
  const merged = mergeDedupedCourses(snapshots);
  const displayed = applyCatalogFilter(merged, filter);
  const catalogRunning = isRunning && counts.catalogSearchesPending > 0;

  const headline = catalogRunning
    ? "Researching courses…"
    : counts.catalogSearches > 0 || detail
      ? "Research completed"
      : "Activity completed";

  const showMergedResearch =
    expanded && merged.length > 0 && snapshots.some((entry) => entry.ok && entry.kind === "courses");

  return (
    <div className="flex flex-col gap-1.5" aria-live="polite">
      <div className="min-w-0 rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-xs">
        <p className="font-medium text-foreground" role="status">
          {headline}
        </p>
        {!catalogRunning && detail ? (
          <p className="mt-0.5 text-muted-foreground">{detail}</p>
        ) : null}
        {!expanded ? (
          <button
            type="button"
            className={`${TOGGLE_CLASS} mt-2`}
            aria-expanded={false}
            onClick={() => setExpanded(true)}
          >
            Show activity details
          </button>
        ) : (
          <div className="mt-2 space-y-2">
            {expandedCalls.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                {expandedCalls.map((call) => (
                  <ToolRow
                    key={call.id}
                    call={call as ToolCall}
                    result={results.get(call.id)}
                    isRunning={isRunning}
                  />
                ))}
              </div>
            ) : null}
            {showMergedResearch ? (
              <div className="space-y-1.5 border-t border-border/60 pt-2">
                <p className="text-muted-foreground">
                  {describeLoadedResultSummary({
                    filter,
                    shown: displayed.length,
                    loaded: merged.length,
                    totalCount: merged.length,
                  })}
                  {" · "}
                  deduplicated across searches
                </p>
                <div role="group" aria-label="Filter research courses" className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={`${TOGGLE_CLASS} ${filter === "all" ? "bg-surface-subtle" : ""}`}
                    aria-pressed={filter === "all"}
                    onClick={() => setFilter("all")}
                  >
                    All loaded
                  </button>
                  <button
                    type="button"
                    className={`${TOGGLE_CLASS} ${filter === "offered" ? "bg-surface-subtle" : ""}`}
                    aria-pressed={filter === "offered"}
                    onClick={() => setFilter("offered")}
                  >
                    Offered only
                  </button>
                </div>
                <ol aria-label="Research courses" className="m-0 list-none overflow-x-hidden p-0">
                  {displayed.map((course, index) => (
                    <CatalogCourseRow
                      key={course.courseCode}
                      course={course}
                      position={index + 1}
                    />
                  ))}
                </ol>
                <ul className="m-0 list-none space-y-1 p-0 text-muted-foreground">
                  {snapshots.map((snapshot) => (
                    <li key={snapshot.callId}>
                      {searchLabel(snapshot)}
                      {snapshot.ok
                        ? snapshot.kind === "courses"
                          ? ` · ${snapshot.totalCount} matches`
                          : snapshot.kind === "empty"
                            ? " · no matches"
                            : snapshot.kind === "instructors"
                              ? ` · ${snapshot.totalCount} instructors`
                              : ""
                        : " · could not load"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <button
              type="button"
              className={TOGGLE_CLASS}
              aria-expanded
              onClick={() => setExpanded(false)}
            >
              Hide activity details
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function activityExpansionKeyFromParts(parts: { id?: string }[]): string {
  const ids = parts.map((part) => part.id ?? "part").slice(0, 4);
  return `activity-${ids.join("-")}`;
}
