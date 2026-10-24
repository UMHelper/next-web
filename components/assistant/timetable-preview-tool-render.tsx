"use client";

import Link from "next/link";
import { useRenderTool } from "@copilotkit/react-core/v2";
import { useCallback, useMemo, useRef, useState } from "react";
import { z } from "zod/v4";

import { ToolFailureAlert } from "@/components/assistant/tool-failure-alert";
import WeekGrid from "@/components/timetable/week-grid";
import {
  PREVIEW_TIMETABLE_TOOL_NAME,
  parseTimetablePreviewResult,
  type PreviewSection,
  type TimetablePreviewResult,
} from "@/lib/assistant/timetable-preview";
import {
  analyzeTimetable,
  type AnalyzedConflict,
  type AnalyzedMeeting,
  type DayGap,
} from "@/lib/timetable/analysis";
import type { PlanSection, Weekday } from "@/lib/timetable/schema";
import { buildReviewPath } from "@/lib/site";

const WEEKDAYS: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI"];

const DAY_NAMES: Record<Weekday, string> = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THU: "Thursday",
  FRI: "Friday",
};

const TAB_LABELS: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
};

const PREVIEW_FAILURE = "Couldn't build the timetable preview.";

function formatTimeRange(start: string, end: string) {
  return `${start}–${end}`;
}

function formatHyphenRange(range: string) {
  const [start, end] = range.split("-");
  return formatTimeRange(start, end);
}

function formatGapDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

function stripPreviewSection(section: PreviewSection): PlanSection {
  const { origin: _origin, replaces: _replaces, ...plan } = section;
  return plan;
}

function overlapLines(meeting: AnalyzedMeeting, conflicts: AnalyzedConflict[]) {
  return conflicts
    .filter(
      (conflict) =>
        conflict.day === meeting.day &&
        (conflict.a === meeting.label || conflict.b === meeting.label),
    )
    .map((conflict) => {
      const other = conflict.a === meeting.label ? conflict.b : conflict.a;
      return `Overlaps ${other} ${formatHyphenRange(conflict.overlap)}`;
    });
}

function dayTabName(day: Weekday, classCount: number, hasConflict: boolean) {
  const noun = classCount === 1 ? "class" : "classes";
  const base = `${DAY_NAMES[day]}, ${classCount} ${noun}`;
  return hasConflict ? `${base}, has a conflict` : base;
}

function PreviewLoading() {
  return (
    <div className="text-xs text-muted-foreground" role="status">
      Building timetable preview…
    </div>
  );
}

function DayTabs({
  days,
  conflicts,
  selected,
  onSelect,
}: {
  days: ReturnType<typeof analyzeTimetable>["days"];
  conflicts: AnalyzedConflict[];
  selected: Weekday;
  onSelect: (day: Weekday) => void;
}) {
  const tabRefs = useRef<Partial<Record<Weekday, HTMLButtonElement | null>>>({});

  const conflictDays = useMemo(() => new Set(conflicts.map((c) => c.day)), [conflicts]);

  const focusTab = useCallback((day: Weekday) => {
    tabRefs.current[day]?.focus();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent, day: Weekday) => {
    const index = WEEKDAYS.indexOf(day);
    if (event.key === "ArrowRight") {
      event.preventDefault();
      const next = WEEKDAYS[(index + 1) % WEEKDAYS.length];
      onSelect(next);
      focusTab(next);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const next = WEEKDAYS[(index + WEEKDAYS.length - 1) % WEEKDAYS.length];
      onSelect(next);
      focusTab(next);
    } else if (event.key === "Home") {
      event.preventDefault();
      onSelect("MON");
      focusTab("MON");
    } else if (event.key === "End") {
      event.preventDefault();
      onSelect("FRI");
      focusTab("FRI");
    }
  };

  return (
    <div role="tablist" aria-label="Day" className="flex min-w-0 flex-wrap gap-1">
      {WEEKDAYS.map((day) => {
        const summary = days.find((entry) => entry.day === day);
        const classCount = summary?.meetings.length ?? 0;
        const isSelected = selected === day;
        return (
          <button
            key={day}
            type="button"
            role="tab"
            ref={(node) => {
              tabRefs.current[day] = node;
            }}
            id={`preview-tab-${day}`}
            aria-controls={`preview-panel-${day}`}
            aria-selected={isSelected}
            tabIndex={isSelected ? 0 : -1}
            aria-label={dayTabName(day, classCount, conflictDays.has(day))}
            onClick={() => onSelect(day)}
            onKeyDown={(event) => onKeyDown(event, day)}
            className="rounded border border-border px-2 py-1 text-xs data-[selected=true]:border-brand data-[selected=true]:bg-surface-subtle"
            data-selected={isSelected ? "true" : "false"}
          >
            {TAB_LABELS[day]}
          </button>
        );
      })}
    </div>
  );
}

function DayAgenda({
  day,
  meetings,
  gaps,
  conflicts,
  previewByKey,
}: {
  day: Weekday;
  meetings: AnalyzedMeeting[];
  gaps: DayGap[];
  conflicts: AnalyzedConflict[];
  previewByKey: Map<string, PreviewSection>;
}) {
  if (meetings.length === 0) {
    return <p className="text-sm text-muted-foreground">No classes</p>;
  }

  type Row =
    | { kind: "class"; meeting: AnalyzedMeeting; sortKey: string }
    | { kind: "gap"; gap: DayGap; sortKey: string };

  const rows: Row[] = [
    ...meetings.map((meeting) => ({
      kind: "class" as const,
      meeting,
      sortKey: meeting.start,
    })),
    ...gaps.map((gap) => ({
      kind: "gap" as const,
      gap,
      sortKey: gap.start,
    })),
  ].sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  return (
    <ol aria-label={`${DAY_NAMES[day]} classes`} className="space-y-2 text-sm">
      {rows.map((row) => {
        if (row.kind === "gap") {
          return (
            <li key={`gap-${row.gap.start}`} className="text-muted-foreground">
              {`Free ${formatTimeRange(row.gap.start, row.gap.end)} · ${formatGapDuration(row.gap.minutes)}`}
            </li>
          );
        }
        const meeting = row.meeting;
        const preview = previewByKey.get(meeting.sectionKey);
        const overlaps = overlapLines(meeting, conflicts);
        return (
          <li key={`${meeting.sectionKey}-${meeting.start}`} className="space-y-0.5">
            <div className="font-medium">{formatTimeRange(meeting.start, meeting.end)}</div>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link
                href={buildReviewPath(meeting.courseCode, meeting.prof)}
                className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {meeting.label}
              </Link>
              {meeting.courseTitle ? (
                <span className="text-muted-foreground">{meeting.courseTitle}</span>
              ) : null}
            </div>
            {meeting.location ? (
              <div className="text-xs text-muted-foreground">{meeting.location}</div>
            ) : null}
            {preview?.origin === "added" ? (
              <div className="text-xs text-muted-foreground">Added in preview</div>
            ) : null}
            {preview?.replaces ? (
              <div className="text-xs text-muted-foreground">Replaces {preview.replaces}</div>
            ) : null}
            {overlaps.map((line) => (
              <div key={line} className="text-xs text-destructive-strong">
                {line}
              </div>
            ))}
          </li>
        );
      })}
    </ol>
  );
}

function ReadyPreview({ data }: { data: Extract<TimetablePreviewResult, { status: "ready" }> }) {
  const planSections = useMemo(() => data.sections.map(stripPreviewSection), [data.sections]);
  const analysis = useMemo(
    () => analyzeTimetable(planSections, { partial: data.partial }),
    [planSections, data.partial],
  );
  const [selectedDay, setSelectedDay] = useState<Weekday>(data.focusDay);

  const previewByKey = useMemo(
    () => new Map(data.sections.map((section) => [section.key, section])),
    [data.sections],
  );

  const emphasizeKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const section of data.sections) {
      if (section.origin === "added") keys.add(section.key);
    }
    return keys;
  }, [data.sections]);

  const regionLabel =
    data.kind === "saved" ? "Saved timetable preview" : "Hypothetical timetable preview";
  const heading = data.kind === "saved" ? "Saved timetable" : "Preview · Not saved";
  const subline =
    data.plan !== null ? `${data.plan.name} · ${data.term}` : data.term;

  const summaryParts = [
    `${analysis.courseCount} courses · ${analysis.conflicts.length} conflicts`,
  ];
  if (analysis.unscheduled.length > 0) {
    summaryParts.push(`${analysis.unscheduled.length} without class times`);
  }
  const summary = summaryParts.join(" · ");

  return (
    <section aria-label={regionLabel} className="min-w-0 space-y-3 rounded-lg border p-3">
      <div className="space-y-1">
        <h3 className="text-base font-semibold leading-snug">{heading}</h3>
        <p className="text-xs text-muted-foreground">{subline}</p>
        <p className="text-xs text-muted-foreground">{summary}</p>
      </div>

      <div className="min-w-0 overflow-hidden">
        <WeekGrid sections={planSections} mini emphasizeKeys={emphasizeKeys} />
      </div>

      <DayTabs
        days={analysis.days}
        conflicts={analysis.conflicts}
        selected={selectedDay}
        onSelect={setSelectedDay}
      />

      <div
        role="tabpanel"
        id={`preview-panel-${selectedDay}`}
        aria-labelledby={`preview-tab-${selectedDay}`}
        className="min-w-0"
      >
        <DayAgenda
          day={selectedDay}
          meetings={analysis.days.find((entry) => entry.day === selectedDay)?.meetings ?? []}
          gaps={analysis.days.find((entry) => entry.day === selectedDay)?.gaps ?? []}
          conflicts={analysis.conflicts}
          previewByKey={previewByKey}
        />
      </div>

      {analysis.unscheduled.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {`No class times listed: ${analysis.unscheduled.join(", ")}`}
        </p>
      ) : null}

      {analysis.partial.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {`Some class times can't be shown: ${analysis.partial.join(", ")}`}
        </p>
      ) : null}

      <footer className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
        {data.kind === "saved" ? (
          <Link
            href="/timetable"
            className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open My Timetable
          </Link>
        ) : (
          <p>Not saved. Add sections yourself from the course page or My Timetable.</p>
        )}
        <p>Weekly pattern; holidays and cancellations are not shown.</p>
      </footer>
    </section>
  );
}

function PreviewBody({ data }: { data: TimetablePreviewResult }) {
  if (data.status === "ready") return <ReadyPreview data={data} />;

  if (data.status === "needs_section") {
    return (
      <div className="min-w-0 space-y-2 rounded-lg border p-3 text-sm">
        <p>{`Pick a section of ${data.courseCode} (${data.instructor}):`}</p>
        <ul className="space-y-1 text-muted-foreground">
          {data.options.map((option) => (
            <li key={option.section}>{`${option.section} · ${option.meetings.join(", ")}`}</li>
          ))}
        </ul>
      </div>
    );
  }

  if (data.status === "no_timetable") {
    if (data.timetable === "no_plan") {
      return (
        <p className="min-w-0 rounded-lg border p-3 text-sm text-muted-foreground">
          You don&apos;t have a saved timetable yet.{" "}
          <Link href="/timetable" className="underline-offset-2 hover:underline">
            My Timetable
          </Link>
        </p>
      );
    }
    if (data.timetable === "loading") {
      return (
        <p className="min-w-0 rounded-lg border p-3 text-sm text-muted-foreground">
          Your timetable is still loading. Ask again in a moment.
        </p>
      );
    }
    return <ToolFailureAlert message="Couldn't read your timetable." />;
  }

  if (data.status === "term_mismatch") {
    return (
      <p className="min-w-0 rounded-lg border p-3 text-sm text-muted-foreground">
        {`Your timetable is for ${data.planTerm}; class times are only available for ${data.catalogTerm}.`}
      </p>
    );
  }

  if (data.status === "not_found") {
    return (
      <p className="min-w-0 rounded-lg border p-3 text-sm text-muted-foreground">
        No such section on this site.
      </p>
    );
  }

  return <ToolFailureAlert message={PREVIEW_FAILURE} />;
}

export function TimetablePreviewToolResult({
  status,
  result,
}: {
  status: "inProgress" | "executing" | "complete";
  result?: string;
}) {
  if (status === "inProgress" || status === "executing") {
    return <PreviewLoading />;
  }

  const view = parseTimetablePreviewResult(result ?? "");
  if (view.kind === "malformed") {
    return <ToolFailureAlert message={PREVIEW_FAILURE} />;
  }

  if (view.data.status === "invalid_request" || view.data.status === "temporarily_unavailable") {
    return <ToolFailureAlert message={PREVIEW_FAILURE} />;
  }

  return <PreviewBody data={view.data} />;
}

export function useTimetablePreviewToolRender(): void {
  useRenderTool(
    {
      name: PREVIEW_TIMETABLE_TOOL_NAME,
      parameters: z.object({}).passthrough(),
      render: ({ status, result }) => (
        <TimetablePreviewToolResult status={status} result={result} />
      ),
    },
    [],
  );
}
