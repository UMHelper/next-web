import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogCourseCard } from "@/components/assistant/catalog-course-card";
import type { CatalogCourse } from "@/lib/mcp/schemas";
import { SITE_URL } from "@/lib/site";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const fullCourse: CatalogCourse = {
  courseCode: "ACCT1000",
  titleEn: "Principles of Accounting I",
  titleZh: "會計學原理 I",
  faculty: "FBA",
  department: "AIM",
  credits: "3",
  isOffered: true,
  url: `${SITE_URL}/course/ACCT1000`,
};

afterEach(() => {
  cleanup();
});

describe("CatalogCourseCard", () => {
  it("shows code, titles, credits, faculty, and department", () => {
    render(<CatalogCourseCard course={fullCourse} />);

    expect(screen.getByRole("heading", { name: "ACCT1000" })).toBeTruthy();
    expect(screen.getByText("Principles of Accounting I")).toBeTruthy();
    expect(screen.getByText("會計學原理 I")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("FBA")).toBeTruthy();
    expect(screen.getByText("AIM")).toBeTruthy();
  });

  it("omits null title, credits, faculty, and department", () => {
    const course: CatalogCourse = {
      ...fullCourse,
      titleEn: null,
      titleZh: null,
      credits: null,
      faculty: null,
      department: null,
    };
    render(<CatalogCourseCard course={course} />);

    expect(screen.queryByText("Principles of Accounting I")).toBeNull();
    expect(screen.queryByText("會計學原理 I")).toBeNull();
    expect(screen.queryByText("FBA")).toBeNull();
    expect(screen.queryByText("AIM")).toBeNull();
    expect(screen.getByRole("heading", { name: "ACCT1000" })).toBeTruthy();
  });

  it('shows "Offered this term" when isOffered is true', () => {
    render(<CatalogCourseCard course={fullCourse} />);
    expect(screen.getByText("Offered this term")).toBeTruthy();
  });

  it('shows "Not offered this term" when isOffered is false', () => {
    render(<CatalogCourseCard course={{ ...fullCourse, isOffered: false }} />);
    expect(screen.getByText("Not offered this term")).toBeTruthy();
  });

  it("links to /course/ACCT1000 from a lower-case course code", () => {
    render(
      <CatalogCourseCard
        course={{
          ...fullCourse,
          courseCode: "acct1000",
          url: `${SITE_URL}/course/acct1000`,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "View course acct1000" }).getAttribute("href")).toBe(
      "/course/ACCT1000",
    );
    expect(screen.getByRole("heading", { name: "acct1000" })).toBeTruthy();
  });

  it("encodes course code in the link path", () => {
    render(
      <CatalogCourseCard
        course={{
          ...fullCourse,
          courseCode: "A/B 1",
          url: `${SITE_URL}/course/A%2FB%201`,
        }}
      />,
    );

    expect(screen.getByRole("link", { name: "View course A/B 1" }).getAttribute("href")).toBe(
      "/course/A%2FB%201",
    );
  });

  it("does not use the result url in the link href", () => {
    render(<CatalogCourseCard course={fullCourse} />);
    const href = screen.getByRole("link", { name: "View course ACCT1000" }).getAttribute("href");
    expect(href).toBe("/course/ACCT1000");
    expect(href).not.toContain("umeh.top");
  });
});
