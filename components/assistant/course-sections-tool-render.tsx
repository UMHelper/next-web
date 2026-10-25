"use client";

import Link from "next/link";
import { useRenderTool } from "@copilotkit/react-core/v2";
import { z } from "zod/v4";

import { ToolFailureAlert } from "@/components/assistant/tool-failure-alert";
import { clarificationAsk } from "@/lib/assistant/course-referent";
import {
  GET_COURSE_SECTIONS_TOOL_NAME,
  formatWeekday,
  parseCourseSectionsResult,
} from "@/lib/assistant/course-sections-ui";
import type { ToolResultFailure } from "@/lib/assistant/tool-result";
import type { CourseSection, SectionSchedule } from "@/lib/mcp/schemas";
import { buildCoursePath, buildReviewPath } from "@/lib/site";

const FAILURE_MESSAGE: Record<ToolResultFailure, string> = {
  not_found: "No sections for that course and instructor on this site.",
  temporarily_unavailable: "Class sections are temporarily unavailable. Try again in a moment.",
  invalid_request: "Couldn't read the class sections. Try rephrasing or ask again.",
  malformed: "Couldn't read the class sections. Try rephrasing or ask again.",
};

function CourseSectionsLoading() {
  return (
    <div className="text-xs text-muted-foreground" role="status">
      Loading class sections…
    </div>
  );
}

function ScheduleRow({ schedule }: { schedule: SectionSchedule }) {
  const time = `${formatWeekday(schedule.weekday)} ${schedule.startTime}–${schedule.endTime}`;
  const location = schedule.location ?? "Location not listed";
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
      <span>{time}</span>
      <span className="text-xs text-muted-foreground">{location}</span>
    </li>
  );
}

function SectionCard({ section }: { section: CourseSection }) {
  return (
    <article
      aria-label={`Section ${section.section}`}
      className="rounded-lg border border-border bg-background p-3"
    >
      <h4 className="text-sm font-medium">Section {section.section}</h4>
      {section.schedules.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No meeting times listed</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {section.schedules.map((schedule, index) => (
            <ScheduleRow key={`${schedule.weekday}-${schedule.startTime}-${index}`} schedule={schedule} />
          ))}
        </ul>
      )}
    </article>
  );
}

export function CourseSectionsToolResult({
  status,
  result,
}: {
  status: "inProgress" | "executing" | "complete";
  result?: string;
}) {
  if (status === "inProgress" || status === "executing") {
    return <CourseSectionsLoading />;
  }

  const ask = clarificationAsk(result ?? "");
  if (ask) {
    return <p className="text-sm text-muted-foreground">{ask}</p>;
  }

  const view = parseCourseSectionsResult(result ?? "");

  if (view.kind === "failure") {
    return <ToolFailureAlert message={FAILURE_MESSAGE[view.reason]} />;
  }

  if (view.kind === "empty") {
    const code = view.courseCode.trim().toUpperCase();
    const instructor = view.instructor.trim().toUpperCase();
    return (
      <p className="min-w-0 break-words text-sm text-muted-foreground">
        {`No sections are listed for ${code} with ${instructor} this term.`}
      </p>
    );
  }

  const code = view.data.courseCode.trim().toUpperCase();
  const instructor = view.data.instructor.trim().toUpperCase();

  return (
    <div className="min-w-0 space-y-3 break-words text-sm text-foreground">
      <div className="space-y-2">
        <h3 className="text-base font-semibold leading-snug">{`${code} · ${instructor}`}</h3>
        {view.data.sectionDataComplete === false ? (
          <p className="text-xs text-muted-foreground">
            Some sections or class times could not be listed.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <Link
            href={buildReviewPath(code, instructor)}
            aria-label={`Reviews for ${code} by ${instructor}`}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Reviews
          </Link>
          <Link
            href={buildCoursePath(code)}
            aria-label={`View course ${code}`}
            className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            View course page
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        {view.data.sections.map((section) => (
          <SectionCard key={section.section} section={section} />
        ))}
      </div>
    </div>
  );
}

export function useCourseSectionsToolRender(): void {
  useRenderTool(
    {
      name: GET_COURSE_SECTIONS_TOOL_NAME,
      parameters: z.object({}).passthrough(),
      render: ({ status, result }) => (
        <CourseSectionsToolResult status={status} result={result} />
      ),
    },
    [],
  );
}
