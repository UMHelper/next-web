"use client";

import Link from "next/link";
import { useRenderTool } from "@copilotkit/react-core/v2";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod/v4";

import { ToolFailureAlert } from "@/components/assistant/tool-failure-alert";
import { clarificationAsk } from "@/lib/assistant/course-referent";
import {
  GET_COURSE_TOOL_NAME,
  parseCourseDetailResult,
} from "@/lib/assistant/course-detail-ui";
import type { ToolResultFailure } from "@/lib/assistant/tool-result";
import type { CourseInstructorSummary } from "@/lib/mcp/schemas";
import { buildCoursePath, buildReviewPath } from "@/lib/site";
import { cn } from "@/lib/utils";

const FAILURE_MESSAGE: Record<ToolResultFailure, string> = {
  not_found: "That course isn't on this site.",
  temporarily_unavailable: "Course details are temporarily unavailable. Try again in a moment.",
  invalid_request: "Couldn't read the course details. Try rephrasing or ask again.",
  malformed: "Couldn't read the course details. Try rephrasing or ask again.",
};

const INSTRUCTOR_PREVIEW_LIMIT = 5;

function formatReviewCount(count: number) {
  return count === 1 ? "1 review" : `${count} reviews`;
}

function CourseDetailLoading() {
  return (
    <div className="text-xs text-muted-foreground" role="status">
      Loading course details…
    </div>
  );
}

function CourseDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  const measure = useCallback(() => {
    const el = textRef.current;
    if (!el || expanded) return;
    setCanExpand(el.scrollHeight > el.clientHeight + 1);
  }, [expanded]);

  useEffect(() => {
    measure();
  }, [description, measure]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || expanded || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    return () => observer.disconnect();
  }, [description, expanded, measure]);

  const showToggle = canExpand || expanded;

  return (
    <div className="space-y-1">
      <p
        ref={textRef}
        className={cn(
          "break-words text-sm leading-snug",
          !expanded && "line-clamp-4",
        )}
      >
        {description}
      </p>
      {showToggle ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "less" : "more"}
        </button>
      ) : null}
    </div>
  );
}

function InstructorRow({ code, instructor }: { code: string; instructor: CourseInstructorSummary }) {
  const name = instructor.name.trim().toUpperCase();
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
      <Link
        href={buildReviewPath(code, name)}
        aria-label={`Reviews for ${code} by ${name}`}
        className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {name}
      </Link>
      <span className="text-xs text-muted-foreground">{formatReviewCount(instructor.commentCount)}</span>
      {instructor.isOffered ? (
        <span className="text-xs text-muted-foreground">Teaching this term</span>
      ) : null}
    </li>
  );
}

export function CourseDetailToolResult({
  status,
  result,
}: {
  status: "inProgress" | "executing" | "complete";
  result?: string;
}) {
  if (status === "inProgress" || status === "executing") {
    return <CourseDetailLoading />;
  }

  const ask = clarificationAsk(result ?? "");
  if (ask) {
    return <p className="text-sm text-muted-foreground">{ask}</p>;
  }

  const view = parseCourseDetailResult(result ?? "");

  if (view.kind === "failure") {
    return <ToolFailureAlert message={FAILURE_MESSAGE[view.reason]} />;
  }

  const { course, instructors, totalCount } = view.data;
  const code = course.courseCode.trim().toUpperCase();
  const offering = course.isOffered ? "Offered this term" : "Not offered this term";
  const shownInstructors = instructors.slice(0, INSTRUCTOR_PREVIEW_LIMIT);
  const showInstructorSummary =
    instructors.length > INSTRUCTOR_PREVIEW_LIMIT || totalCount > instructors.length;

  return (
    <article
      aria-label={code}
      className="min-w-0 rounded-lg border border-border bg-background p-3 text-sm text-foreground"
    >
      <div className="min-w-0 space-y-2 break-words">
        <div className="space-y-1">
          <h3 className="text-base font-semibold leading-snug">{code}</h3>
          {course.titleEn ? <p className="leading-snug">{course.titleEn}</p> : null}
          {course.titleZh ? (
            <p className="leading-snug text-muted-foreground">{course.titleZh}</p>
          ) : null}
        </div>

        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {course.credits ? (
            <div>
              <dt className="sr-only">Credits</dt>
              <dd>{course.credits} credits</dd>
            </div>
          ) : null}
          {course.faculty ? (
            <div>
              <dt className="sr-only">Faculty</dt>
              <dd>{course.faculty}</dd>
            </div>
          ) : null}
          {course.department ? (
            <div>
              <dt className="sr-only">Department</dt>
              <dd>{course.department}</dd>
            </div>
          ) : null}
          {course.programLevel ? (
            <div>
              <dt className="sr-only">Program level</dt>
              <dd>{course.programLevel}</dd>
            </div>
          ) : null}
          {course.medium ? (
            <div>
              <dt className="sr-only">Medium</dt>
              <dd>{course.medium}</dd>
            </div>
          ) : null}
        </dl>

        <p className="text-xs text-muted-foreground">{offering}</p>

        {course.description ? <CourseDescription description={course.description} /> : null}

        <div className="space-y-2 pt-1">
          <h4 className="text-xs font-medium text-muted-foreground">Instructors</h4>
          {instructors.length === 0 ? (
            <p className="text-xs text-muted-foreground">No instructors recorded on this site.</p>
          ) : (
            <>
              {showInstructorSummary ? (
                <p className="text-xs text-muted-foreground">
                  {`Showing ${Math.min(INSTRUCTOR_PREVIEW_LIMIT, instructors.length)} of ${totalCount} instructors`}
                </p>
              ) : null}
              <ul className="space-y-2">
                {shownInstructors.map((instructor) => (
                  <InstructorRow key={instructor.name} code={code} instructor={instructor} />
                ))}
              </ul>
            </>
          )}
        </div>

        <Link
          href={buildCoursePath(code)}
          aria-label={`View course ${code}`}
          className="inline-flex text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View course page
        </Link>
      </div>
    </article>
  );
}

export function useCourseDetailToolRender(): void {
  useRenderTool(
    {
      name: GET_COURSE_TOOL_NAME,
      parameters: z.object({}).passthrough(),
      render: ({ status, result }) => (
        <CourseDetailToolResult status={status} result={result} />
      ),
    },
    [],
  );
}
