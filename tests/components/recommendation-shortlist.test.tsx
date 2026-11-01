import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlannerVersionContext } from "@/components/assistant/planner-version-context";
import { RecommendationShortlist } from "@/components/assistant/recommendation-shortlist";
import { DISCOVER_COURSE_CANDIDATES_TOOL_NAME } from "@/lib/assistant/discovery/schema";
import { GET_COURSE_TOOL_NAME } from "@/lib/assistant/course-detail-ui";
import type { ToolCallLike } from "@/lib/assistant/presentation";
import { SITE_URL } from "@/lib/site";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function call(id: string, name: string, args: unknown): ToolCallLike {
  return { id, function: { name, arguments: JSON.stringify(args) } };
}

function discoverGestResult(plannerVersion: string) {
  return JSON.stringify({
    status: "ok",
    term: { year: 2026, sem: 1, label: "2026/2027 AY Sem 1" },
    timetable: { status: "ready", plannerVersion },
    examined: { courses: 1, sections: 1, totalMatchingCourses: 1, truncated: false },
    excluded: {
      alreadyInPlan: 0,
      excludedCodes: 0,
      noListedSections: 0,
      required: { startAfter: 0, endBefore: 0, avoidDays: 0, avoidWindows: 0, noClash: 0 },
    },
    notApplied: [],
    candidates: [
      {
        rank: 1,
        courseCode: "GEST1006",
        titleEn: "Sample GE",
        titleZh: null,
        credits: 3,
        courseType: "GE",
        suggestedYear: 1,
        section: "002",
        instructors: [],
        meetings: ["TUE 11:30-12:45", "FRI 11:30-12:45"],
        meetingsComplete: true,
        fit: "verified_no_clash",
        matched: [],
        tradeoffs: [],
        signals: {},
        score: 1,
        otherSections: [],
      },
    ],
    unverified: [],
    noListedSections: [],
    mutualClashes: [],
    ranking: "test",
    notes: [],
  });
}

const getCourseResult = JSON.stringify({
  course: {
    courseCode: "CISC3023",
    titleEn: "Intro",
    titleZh: null,
    credits: "3",
    faculty: "FST",
    department: "CISC",
    programLevel: null,
    suggestedYear: null,
    medium: null,
    gradingSystem: null,
    courseType: null,
    duration: null,
    description: null,
    aka: [],
    isOffered: true,
    url: `${SITE_URL}/course/CISC3023`,
  },
  page: 1,
  hasMore: false,
  totalCount: 0,
  instructors: [],
});

afterEach(() => {
  cleanup();
});

function renderShortlist(
  plannerVersion: string | null,
  options: {
    calls: ToolCallLike[];
    results: Map<string, { content?: unknown }>;
    courses: string[];
    sections?: Record<string, string>;
  },
) {
  return render(
    <PlannerVersionContext.Provider value={plannerVersion}>
      <div style={{ width: 380 }}>
        <RecommendationShortlist
          courses={options.courses}
          calls={options.calls}
          results={options.results}
          sections={options.sections}
        />
      </div>
    </PlannerVersionContext.Provider>,
  );
}

describe("RecommendationShortlist section line", () => {
  const discoveryCalls = [
    call("d1", DISCOVER_COURSE_CANDIDATES_TOOL_NAME, { scope: { courseType: "GE" } }),
  ];
  const discoveryResults = new Map([["d1", { content: discoverGestResult("v-match") }]]);

  it("shows section, meetings, and fit badge when planner versions match", () => {
    renderShortlist("v-match", {
      calls: discoveryCalls,
      results: discoveryResults,
      courses: ["GEST1006"],
      sections: { GEST1006: "002" },
    });

    expect(screen.getByText("Recommended courses")).toBeTruthy();
    expect(screen.getByText(/Sec 002/)).toBeTruthy();
    expect(screen.getByText(/TUE, FRI 11:30–12:45/)).toBeTruthy();
    expect(screen.getByText("No clash with saved timetable")).toBeTruthy();
  });

  it("shows re-check badge when planner version differs", () => {
    renderShortlist("v-other", {
      calls: discoveryCalls,
      results: discoveryResults,
      courses: ["GEST1006"],
      sections: { GEST1006: "002" },
    });

    expect(screen.getByText("Timetable changed – ask me to re-check")).toBeTruthy();
    expect(screen.queryByText("No clash with saved timetable")).toBeNull();
  });

  it("omits the section line for get_course-only hydration", () => {
    const calls = [call("g1", GET_COURSE_TOOL_NAME, { code: "CISC3023" })];
    const results = new Map([["g1", { content: getCourseResult }]]);

    renderShortlist("v-match", {
      calls,
      results,
      courses: ["CISC3023"],
    });

    expect(screen.getByText("Recommended courses")).toBeTruthy();
    expect(screen.queryByText(/Sec /)).toBeNull();
    expect(screen.queryByText("No clash with saved timetable")).toBeNull();
  });

  it("keeps min-w-0 and truncation classes at narrow width", () => {
    const { container } = renderShortlist("v-match", {
      calls: discoveryCalls,
      results: discoveryResults,
      courses: ["GEST1006"],
      sections: { GEST1006: "002" },
    });

    const row = container.querySelector("li");
    expect(row?.className).toContain("min-w-0");

    const sectionLine = container.querySelector("[data-section-line]");
    expect(sectionLine?.className).toContain("min-w-0");
    expect(sectionLine?.className).toMatch(/truncate|line-clamp/);
  });
});
