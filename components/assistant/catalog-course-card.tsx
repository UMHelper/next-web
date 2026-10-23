import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import type { CatalogCourse } from "@/lib/mcp/schemas";
import { buildCoursePath } from "@/lib/site";

export function CatalogCourseCard({ course }: { course: CatalogCourse }) {
  const offering = course.isOffered ? "Offered this term" : "Not offered this term";

  return (
    <article className="rounded-lg border border-border bg-background p-3 text-sm text-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold leading-snug">{course.courseCode}</h3>
          {course.titleEn ? <p className="leading-snug">{course.titleEn}</p> : null}
          {course.titleZh ? (
            <p className="leading-snug text-muted-foreground">{course.titleZh}</p>
          ) : null}
          <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {course.credits ? (
              <div>
                <dt className="sr-only">Credits</dt>
                <dd>{course.credits}</dd>
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
          </dl>
          <p className="pt-1 text-xs text-muted-foreground">{offering}</p>
        </div>
        <Link
          href={buildCoursePath(course.courseCode)}
          aria-label={`View course ${course.courseCode}`}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          View
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
    </article>
  );
}
