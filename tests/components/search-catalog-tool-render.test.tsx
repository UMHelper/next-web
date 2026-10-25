import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SearchCatalogToolResult } from "@/components/assistant/search-catalog-tool-render";
import { SITE_URL } from "@/lib/site";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const courseUrl = `${SITE_URL}/course/ACCT1000`;
const instructorUrl = `${SITE_URL}/professor/CHAN%20TAI%20MAN`;

function courseRow(code: string) {
  return {
    courseCode: code,
    titleEn: `Title ${code}`,
    titleZh: null,
    faculty: "FBA",
    department: "AIM",
    credits: "3",
    isOffered: true,
    url: `${SITE_URL}/course/${encodeURIComponent(code.toUpperCase())}`,
  };
}

function coursesResult(count: number, totalCount: number) {
  const results = Array.from({ length: count }, (_, index) =>
    courseRow(`COURSE${index + 1}`),
  );
  return JSON.stringify({
    type: "course",
    page: 1,
    hasMore: totalCount > count,
    totalCount,
    results,
  });
}

function mixedOfferedCoursesResult() {
  const results = Array.from({ length: 10 }, (_, index) => ({
    ...courseRow(`COURSE${index + 1}`),
    isOffered: index === 1 || index === 4,
  }));
  return JSON.stringify({
    type: "course",
    page: 1,
    hasMore: true,
    totalCount: 127,
    results,
  });
}

function noOfferedCoursesResult() {
  const results = Array.from({ length: 10 }, (_, index) => ({
    ...courseRow(`COURSE${index + 1}`),
    isOffered: false,
  }));
  return JSON.stringify({
    type: "course",
    page: 1,
    hasMore: false,
    totalCount: 10,
    results,
  });
}

afterEach(() => {
  cleanup();
});

describe("SearchCatalogToolResult", () => {
  it.each(["inProgress", "executing"] as const)(
    "shows a loading status and no course articles while %s",
    (status) => {
      render(<SearchCatalogToolResult status={status} />);

      expect(screen.getByRole("status").textContent).toContain("Searching the catalog…");
      expect(screen.queryByRole("article")).toBeNull();
      expect(screen.queryByRole("listitem")).toBeNull();
    },
  );

  it("renders a compact loaded list and one truthful count", () => {
    render(<SearchCatalogToolResult status="complete" result={coursesResult(10, 58)} />);

    expect(screen.getByRole("list", { name: "Loaded courses" })).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("1.");
    expect(screen.getAllByRole("listitem")[9].textContent).toContain("10.");
    expect(screen.getByText("58 matches · 10 loaded")).toBeTruthy();
    expect(screen.queryByText("58 courses found")).toBeNull();
    expect(screen.queryByText("Showing 10 of 58")).toBeNull();
    expect(screen.queryByRole("article")).toBeNull();
    expect(screen.getByRole("link", { name: /\bCOURSE1\b/ }).getAttribute("href")).toBe(
      "/course/COURSE1",
    );
  });

  it("links instructors with course counts", () => {
    const result = JSON.stringify({
      type: "instructor",
      page: 1,
      hasMore: false,
      totalCount: 2,
      results: [
        { name: "CHAN TAI MAN", courseCount: 4, url: instructorUrl },
        { name: "WONG KA KI", courseCount: 1, url: `${SITE_URL}/professor/WONG%20KA%20KI` },
      ],
    });

    render(<SearchCatalogToolResult status="complete" result={result} />);

    expect(screen.getByRole("link", { name: "CHAN TAI MAN" }).getAttribute("href")).toBe(
      "/professor/CHAN%20TAI%20MAN",
    );
    expect(screen.getByText("4 courses")).toBeTruthy();
    expect(screen.getByRole("link", { name: "WONG KA KI" }).getAttribute("href")).toBe(
      "/professor/WONG%20KA%20KI",
    );
    expect(screen.getByText("1 course")).toBeTruthy();
    expect(screen.getByText("2 instructors found")).toBeTruthy();
  });

  it("shows empty copy for course and instructor searches", () => {
    const { rerender } = render(
      <SearchCatalogToolResult
        status="complete"
        result={JSON.stringify({
          type: "course",
          page: 1,
          hasMore: false,
          totalCount: 0,
          results: [],
        })}
      />,
    );
    expect(screen.getByText("No courses matched this search.")).toBeTruthy();

    rerender(
      <SearchCatalogToolResult
        status="complete"
        result={JSON.stringify({
          type: "instructor",
          page: 1,
          hasMore: false,
          totalCount: 0,
          results: [],
        })}
      />,
    );
    expect(screen.getByText("No instructors matched this search.")).toBeTruthy();
  });

  it("shows failure copy for temporarily_unavailable", () => {
    render(
      <SearchCatalogToolResult
        status="complete"
        result={JSON.stringify({ error: "temporarily_unavailable" })}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("The catalog is temporarily unavailable.");
    expect(alert.textContent).toContain("Try again in a moment.");
  });

  it("shows failure copy for malformed results", () => {
    render(<SearchCatalogToolResult status="complete" result="Error: boom" />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Couldn't read the catalog search result.");
    expect(alert.textContent).toContain("Try rephrasing or ask again.");
  });

  it("renders at most one alert for a failure", () => {
    render(<SearchCatalogToolResult status="complete" result="Error: boom" />);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("filters loaded courses to offered only and back without leaving the component", () => {
    render(
      <SearchCatalogToolResult
        status="complete"
        result={mixedOfferedCoursesResult()}
        resultSetId="call-1"
      />,
    );
    const group = screen.getByRole("group", { name: "Filter loaded courses" });
    const offered = within(group).getByRole("button", { name: "Offered only" });
    expect(within(group).getByRole("button", { name: "All loaded" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    fireEvent.click(offered);
    expect(offered.getAttribute("aria-pressed")).toBe("true");
    const offeredRows = screen.getAllByRole("listitem");
    expect(offeredRows).toHaveLength(2);
    expect(offeredRows[0].textContent).toContain("1.");
    expect(offeredRows[0].textContent).toContain("COURSE2");
    expect(offeredRows[1].textContent).toContain("2.");
    expect(offeredRows[1].textContent).toContain("COURSE5");
    expect(screen.getByText("2 offered among 10 loaded · 127 total matches")).toBeTruthy();
    expect(screen.queryByText(/Other pages may include more offered courses/)).toBeNull();
    fireEvent.click(within(group).getByRole("button", { name: "All loaded" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getAllByRole("listitem")[1].textContent).toContain("COURSE2");
    expect(screen.getByText("127 matches · 10 loaded")).toBeTruthy();
  });

  it("shows an empty filtered message when no loaded course is offered", () => {
    render(
      <SearchCatalogToolResult
        status="complete"
        result={noOfferedCoursesResult()}
        resultSetId="call-2"
      />,
    );
    const group = screen.getByRole("group", { name: "Filter loaded courses" });
    fireEvent.click(within(group).getByRole("button", { name: "Offered only" }));
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByText("None offered among 10 loaded · 10 total matches")).toBeTruthy();
  });

  it("exposes the result block by id", () => {
    const { container } = render(
      <SearchCatalogToolResult
        status="complete"
        result={mixedOfferedCoursesResult()}
        resultSetId="call-1"
      />,
    );
    expect(container.querySelector("#catalog-results-call-1")).not.toBeNull();
  });

  it("shows no filter controls for instructor results", () => {
    const result = JSON.stringify({
      type: "instructor",
      page: 1,
      hasMore: false,
      totalCount: 1,
      results: [{ name: "CHAN TAI MAN", courseCount: 4, url: instructorUrl }],
    });
    render(<SearchCatalogToolResult status="complete" result={result} resultSetId="call-3" />);
    expect(screen.queryByRole("group", { name: "Filter loaded courses" })).toBeNull();
  });

  it("does not put external urls on instructor links", () => {
    const result = JSON.stringify({
      type: "instructor",
      page: 1,
      hasMore: false,
      totalCount: 1,
      results: [{ name: "CHAN TAI MAN", courseCount: 4, url: instructorUrl }],
    });
    render(<SearchCatalogToolResult status="complete" result={result} />);

    const link = screen.getByRole("link", { name: "CHAN TAI MAN" });
    expect(link.getAttribute("href")).not.toContain("umeh.top");
    expect(within(link).queryByText(/umeh\.top/)).toBeNull();
  });
});
