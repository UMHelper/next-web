import { cleanup, render, screen, within } from "@testing-library/react";
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
    },
  );

  it("renders course cards with found and showing summaries", () => {
    render(<SearchCatalogToolResult status="complete" result={coursesResult(10, 58)} />);

    expect(screen.getAllByRole("article")).toHaveLength(10);
    expect(screen.getByText("58 courses found")).toBeTruthy();
    expect(screen.getByText("Showing 10 of 58")).toBeTruthy();
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
    expect(screen.getByText("No matching courses on this site.")).toBeTruthy();

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
    expect(screen.getByText("No matching instructors on this site.")).toBeTruthy();
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
