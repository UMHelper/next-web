import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: { children?: React.ReactNode }) => props.children,
}));

import { FacultyStatistics } from "@/components/faculty-statistics";
import { PopularCourses } from "@/components/popular-courses";

describe("home statistics components", () => {
  it("renders the faculty empty state", () => {
    const html = renderToStaticMarkup(
      React.createElement(FacultyStatistics, { statistics: [] }),
    );

    expect(html).toContain("Statistics are not available yet.");
  });

  it("renders popular course rows", () => {
    const html = renderToStaticMarkup(
      React.createElement(PopularCourses, {
        courses: [
          {
            courseCode: "COMP1001",
            courseTitleEng: "Intro",
            courseTitleChi: null,
            offeringUnit: "FST",
            commentCount: 3,
            avgResult: 4.5,
            latestCommentAt: "2026-09-01 10:00:00",
          },
        ],
      }),
    );

    expect(html).toContain("COMP1001");
    expect(html).toContain("3 comments in 30 days");
    expect(html).toContain("4.5");
  });
});
