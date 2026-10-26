import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ default: { from: vi.fn() } }));

import {
  MAX_DISCOVERY_RESULT_CHARS,
  runDiscoverCourseCandidates,
  type DiscoveryDeps,
} from "@/lib/assistant/discovery/discover";
import type { DiscoveryPool, PoolCourse, PoolInstructorRow, PoolOffer } from "@/lib/assistant/discovery/pool";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import { timetableVersion } from "@/lib/timetable/analysis";
import { normalizePlanSection } from "@/lib/timetable/schema";

import { offer, pool, poolCourse, pwcRow } from "../fixtures/discovery-pool";

const TERM = { year: 2026, sem: 1 };

function buildPerformancePool(): DiscoveryPool {
  const courses: PoolCourse[] = [];
  const instructorRows: PoolInstructorRow[] = [];
  const offers: PoolOffer[] = [];
  let pwcId = 1;

  for (let courseIndex = 0; courseIndex < 60; courseIndex += 1) {
    const courseCode = `PERF${String(courseIndex).padStart(4, "0")}`;
    courses.push(
      poolCourse({
        courseCode,
        titleEn: `Performance course ${courseIndex}`,
        courseType: courseIndex % 2 === 0 ? "GE" : "Non-GE",
        suggestedYear: (courseIndex % 4) + 1,
        topicBody: courseIndex % 7 === 0 ? "Macao history elective" : "",
      }),
    );

    const sectionsPerCourse = courseIndex % 5 === 0 ? 6 : 5;
    for (let sectionIndex = 0; sectionIndex < sectionsPerCourse; sectionIndex += 1) {
      const section = String(sectionIndex + 1).padStart(3, "0");
      const primary = pwcRow({
        pwcId,
        courseCode,
        instructor: `INST ${courseCode}-${section}`,
        reviews: sectionIndex % 3 === 0 ? 0 : sectionIndex * 3,
        difficulty: 2 + (sectionIndex % 4),
        grade: 2.5 + (sectionIndex % 3) * 0.5,
        result: 3 + (sectionIndex % 2),
        reward: 3,
      });
      instructorRows.push(primary);
      offers.push(
        offer(pwcId, section, [
          `MON ${10 + (sectionIndex % 3)}:00-${11 + (sectionIndex % 3)}:15 E${sectionIndex}`,
          `WED ${10 + (sectionIndex % 3)}:00-${11 + (sectionIndex % 3)}:15 E${sectionIndex}`,
          `FRI ${10 + (sectionIndex % 3)}:00-${11 + (sectionIndex % 3)}:15 E${sectionIndex}`,
        ]),
      );
      pwcId += 1;

      if (sectionIndex % 4 === 0) {
        const coTeacher = pwcRow({
          pwcId,
          courseCode,
          instructor: `CO ${courseCode}-${section}`,
          reviews: sectionIndex === 0 ? 40 : 2,
          difficulty: 4,
          grade: 4,
          result: 4.5,
          reward: 4,
        });
        instructorRows.push(coTeacher);
        offers.push(
          offer(pwcId, section, [
            `MON ${10 + (sectionIndex % 3)}:00-${11 + (sectionIndex % 3)}:15 E${sectionIndex}`,
            `WED ${10 + (sectionIndex % 3)}:00-${11 + (sectionIndex % 3)}:15 E${sectionIndex}`,
            `FRI ${10 + (sectionIndex % 3)}:00-${11 + (sectionIndex % 3)}:15 E${sectionIndex}`,
          ]),
        );
        pwcId += 1;
      }
    }
  }

  return pool({
    totalMatchingCourses: courses.length,
    truncated: false,
    courses,
    instructorRows,
    offers,
  });
}

function performancePlan() {
  const sections = Array.from({ length: 10 }, (_, index) =>
    normalizePlanSection({
      courseCode: `PLAN${index}`,
      prof: "PROF",
      section: "001",
      schedules: [{ date: "TUE", time: "08:00-09:15", location: "E11" }],
    }),
  );
  const state: TimetableState = {
    status: "ready",
    plan: { name: "Perf plan", year: TERM.year, sem: TERM.sem, sections },
    currentTerm: TERM,
    otherPlansThisTerm: 0,
    localOnly: false,
    truncated: false,
    version: timetableVersion(sections),
  };
  return state;
}

describe("runDiscoverCourseCandidates performance", () => {
  it("completes under 200ms and respects the JSON size cap", async () => {
    const discoveryPool = buildPerformancePool();
    const loadPool = vi.fn(async () => discoveryPool);
    const loadReviews = vi.fn(async (ids: number[]) =>
      ids.map((id) => ({
        pwcId: id,
        texts: id % 2 === 0 ? ["Long review text about midterm workload".repeat(4)] : ["Short"],
      })),
    );
    const deps: DiscoveryDeps = {
      loadCatalogTerm: async () => TERM,
      loadPool,
      loadReviews,
    };

    const started = performance.now();
    const result = await runDiscoverCourseCandidates(
      performancePlan(),
      {
        scope: { codePrefix: "PERF" },
        priorities: ["easier", "better_rated"],
        preferred: { startAfter: "09:00", fewerDays: true },
        reviewTerms: ["midterm"],
        limit: 8,
      },
      deps,
    );
    const elapsedMs = performance.now() - started;

    if ("error" in result) throw new Error("unexpected failure");
    const serialized = JSON.stringify(result);
    console.info(`discovery-performance: ${elapsedMs.toFixed(1)}ms, ${serialized.length} chars`);

    expect(result.examined.courses).toBeLessThanOrEqual(150);
    expect(serialized.length).toBeLessThanOrEqual(MAX_DISCOVERY_RESULT_CHARS);
    expect(elapsedMs).toBeLessThan(2_000);
    expect(loadPool).toHaveBeenCalledTimes(1);
    expect(loadReviews.mock.calls.length).toBeLessThanOrEqual(1);
  });
});
