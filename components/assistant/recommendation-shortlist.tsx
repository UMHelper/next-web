"use client";

import { CatalogCourseRow } from "@/components/assistant/catalog-course-row";
import { RecommendationSectionLine } from "@/components/assistant/recommendation-section-line";
import {
  hydrateRecommendationCourse,
  hydrateRecommendationSection,
} from "@/lib/assistant/recommendation-hydrate";
import type { ToolCallLike } from "@/lib/assistant/presentation";

export function RecommendationShortlist({
  courses,
  calls,
  results,
  sections,
}: {
  courses: readonly string[];
  calls: readonly ToolCallLike[];
  results: Map<string, { content?: unknown }>;
  sections?: Record<string, string>;
}) {
  const rows = courses
    .map((code) => {
      const course = hydrateRecommendationCourse(code, calls, results);
      if (!course) return null;
      const normalized = course.courseCode.trim().toUpperCase();
      const sectionEvidence = hydrateRecommendationSection(
        normalized,
        sections?.[normalized] ?? sections?.[code],
        calls,
        results,
      );
      return { course, sectionEvidence };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return null;

  return (
    <section
      aria-label="Course recommendations"
      className="min-w-0 space-y-1 rounded-lg border border-border/70 bg-background/80 px-3 py-2"
    >
      <p className="text-xs font-medium text-foreground">Recommended courses</p>
      <ol className="m-0 list-none overflow-x-hidden p-0">
        {rows.map(({ course, sectionEvidence }, index) => (
          <CatalogCourseRow
            key={course.courseCode}
            course={course}
            position={index + 1}
            footer={sectionEvidence ? <RecommendationSectionLine evidence={sectionEvidence} /> : undefined}
          />
        ))}
      </ol>
    </section>
  );
}
