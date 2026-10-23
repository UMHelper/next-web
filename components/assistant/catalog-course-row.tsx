import Link from "next/link";

import type { CatalogCourse } from "@/lib/mcp/schemas";
import { buildCoursePath } from "@/lib/site";

function formatCredits(credits: string | null): string | null {
  if (!credits) return null;
  if (/^\d+(\.\d+)?$/.test(credits)) return `${credits} cr`;
  return credits;
}

function detailParts(course: CatalogCourse): string[] {
  const titles = [course.titleEn, course.titleZh].filter(
    (part): part is string => Boolean(part),
  );
  const facts = [formatCredits(course.credits), course.department ?? course.faculty].filter(
    (part): part is string => Boolean(part),
  );
  return [...titles, ...facts];
}

export function CatalogCourseRow({
  course,
  position,
}: {
  course: CatalogCourse;
  position: number;
}) {
  const code = course.courseCode.trim().toUpperCase();
  const parts = detailParts(course);

  return (
    <li className="min-w-0 border-b border-border last:border-b-0">
      <Link
        href={buildCoursePath(code)}
        className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 overflow-hidden px-1 py-1.5 text-sm text-foreground outline-none hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="col-start-1 row-start-1 text-xs tabular-nums text-muted-foreground">
          {position}.
        </span>
        <span className="col-start-2 row-start-1 min-w-0 truncate font-semibold tracking-tight">{code}</span>
        {course.isOffered ? (
          <span className="col-start-3 row-start-1 shrink-0 text-xs text-muted-foreground">
            Offered
          </span>
        ) : (
          <span className="sr-only">Not offered this term</span>
        )}
        {parts.length > 0 ? (
          <span className="col-span-2 col-start-2 row-start-2 line-clamp-2 break-words text-xs leading-snug text-muted-foreground">
            {parts.map((part, index) => (
              <span key={`${part}-${index}`}>
                {index > 0 ? " · " : null}
                <span>{part}</span>
              </span>
            ))}
          </span>
        ) : null}
      </Link>
    </li>
  );
}
