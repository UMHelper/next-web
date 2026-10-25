import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CourseSectionsToolResult } from "@/components/assistant/course-sections-tool-render";
import { buildReviewPath } from "@/lib/site";
import { SITE_URL } from "@/lib/site";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const courseUrl = `${SITE_URL}/course/APAC1000`;

const fixture = {
  courseCode: "APAC1000",
  instructor: "CHAN TAI MAN",
  courseUrl,
  sections: [
    {
      section: "001",
      courseUrl,
      schedules: [
        { weekday: "MON", startTime: "09:00", endTime: "10:15", location: "E21-G015" },
        { weekday: "THU", startTime: "09:00", endTime: "10:15", location: null },
      ],
    },
    {
      section: "002",
      courseUrl,
      schedules: [],
    },
  ],
};

afterEach(() => {
  cleanup();
});

describe("CourseSectionsToolResult", () => {
  it.each(["inProgress", "executing"] as const)("shows loading while %s", (status) => {
    render(<CourseSectionsToolResult status={status} />);
    expect(screen.getByRole("status").textContent).toContain("Loading class sections…");
  });

  it("tells the student when some class times could not be listed", () => {
    render(
      <CourseSectionsToolResult
        status="complete"
        result={JSON.stringify({ ...fixture, sectionDataComplete: false })}
      />,
    );
    expect(screen.getByText("Some sections or class times could not be listed.")).toBeTruthy();
  });

  it("renders every meeting of every section", () => {
    render(<CourseSectionsToolResult status="complete" result={JSON.stringify(fixture)} />);
    expect(screen.getByRole("heading", { name: "APAC1000 · CHAN TAI MAN" })).toBeTruthy();
    const s1 = screen.getByRole("article", { name: "Section 001" });
    expect(within(s1).getByText("Mon 09:00–10:15")).toBeTruthy();
    expect(within(s1).getByText("E21-G015")).toBeTruthy();
    expect(within(s1).getByText("Thu 09:00–10:15")).toBeTruthy();
    expect(within(s1).getByText("Location not listed")).toBeTruthy();
    const s2 = screen.getByRole("article", { name: "Section 002" });
    expect(within(s2).getByText("No meeting times listed")).toBeTruthy();
  });

  it("links to the reviews and course pages and offers no timetable action", () => {
    render(<CourseSectionsToolResult status="complete" result={JSON.stringify(fixture)} />);
    expect(
      screen.getByRole("link", { name: "Reviews for APAC1000 by CHAN TAI MAN" }).getAttribute("href"),
    ).toBe(buildReviewPath("APAC1000", "CHAN TAI MAN"));
    expect(screen.getByRole("link", { name: "View course APAC1000" }).getAttribute("href")).toBe(
      "/course/APAC1000",
    );
    expect(screen.queryByRole("button", { name: /timetable/i })).toBeNull();
  });

  it("shows the empty state", () => {
    render(
      <CourseSectionsToolResult
        status="complete"
        result={JSON.stringify({ ...fixture, sections: [] })}
      />,
    );
    expect(
      screen.getByText("No sections are listed for APAC1000 with CHAN TAI MAN this term."),
    ).toBeTruthy();
  });

  it("shows a clarification instead of a course-sections failure", () => {
    render(
      <CourseSectionsToolResult
        status="complete"
        result={JSON.stringify({
          status: "needs_clarification",
          ask: "None of the visible results is in that position.",
        })}
      />,
    );
    expect(screen.getByText("None of the visible results is in that position.")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    ["not_found", "No sections for that course and instructor on this site."],
    ["temporarily_unavailable", "Class sections are temporarily unavailable. Try again in a moment."],
    ["malformed", "Couldn't read the class sections. Try rephrasing or ask again."],
  ] as const)("shows the %s alert", (error, text) => {
    const result =
      error === "malformed" ? "{not json" : JSON.stringify(error === "not_found" ? { error } : { error });
    render(<CourseSectionsToolResult status="complete" result={result} />);
    expect(screen.getByRole("alert").textContent).toBe(text);
  });
});
