"use client";

import { CatalogCourseRow } from "@/components/assistant/catalog-course-row";
import { hydrateRecommendationCourses } from "@/lib/assistant/recommendation-hydrate";
import type { ToolCallLike } from "@/lib/assistant/presentation";

export function RecommendationShortlist({
  courses,
  calls,
  results,
}: {
  courses: readonly string[];
  calls: readonly ToolCallLike[];
  results: Map<string, { content?: unknown }>;
}) {
  const hydrated = hydrateRecommendationCourses(courses, calls, results);
  if (hydrated.length === 0) return null;

  return (
    <section
      aria-label="Course recommendations"
      className="min-w-0 space-y-1 rounded-lg border border-border/70 bg-background/80 px-3 py-2"
    >
      <p className="text-xs font-medium text-foreground">Recommended courses</p>
      <ol className="m-0 list-none overflow-x-hidden p-0">
        {hydrated.map((course, index) => (
          <CatalogCourseRow key={course.courseCode} course={course} position={index + 1} />
        ))}
      </ol>
    </section>
  );
}
