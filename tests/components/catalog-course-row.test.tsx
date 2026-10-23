import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CatalogCourseRow } from "@/components/assistant/catalog-course-row";
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

describe("CatalogCourseRow", () => {
  it("shows the visible position, code, both titles, credits, and department", () => {
    render(<CatalogCourseRow course={fullCourse} position={2} />);

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.textContent).toContain("2.");
    expect(link.textContent).toContain("Principles of Accounting I");
    expect(link.textContent).toContain("會計學原理 I");
    expect(link.textContent).toContain("3 cr");
    expect(link.textContent).toContain("AIM");
    expect(link.textContent).not.toContain("FBA");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("falls back to faculty and keeps a non-numeric credit string", () => {
    render(
      <CatalogCourseRow
        course={{ ...fullCourse, department: null, credits: "3 credits" }}
        position={1}
      />,
    );

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.textContent).toContain("FBA");
    expect(link.textContent).toContain("3 credits");
    expect(link.textContent).not.toContain("3 credits cr");
  });

  it("omits empty titles, credits, and department", () => {
    render(
      <CatalogCourseRow
        course={{
          ...fullCourse,
          titleEn: null,
          titleZh: null,
          credits: null,
          faculty: null,
          department: null,
        }}
        position={1}
      />,
    );

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.textContent).not.toContain("Principles");
    expect(link.textContent).not.toContain("會計");
    expect(link.textContent).not.toContain("cr");
  });

  it("marks offered courses and keeps non-offered status for assistive tech", () => {
    const { rerender } = render(<CatalogCourseRow course={fullCourse} position={1} />);
    expect(screen.getByText("Offered")).toBeTruthy();
    expect(screen.queryByText("Not offered this term")).toBeNull();

    rerender(<CatalogCourseRow course={{ ...fullCourse, isOffered: false }} position={1} />);
    expect(screen.queryByText("Offered")).toBeNull();
    expect(screen.getByText("Not offered this term").className).toContain("sr-only");
  });

  it("links with buildCoursePath and ignores the result url", () => {
    render(
      <CatalogCourseRow
        course={{
          ...fullCourse,
          courseCode: "acct1000",
          url: "https://evil.example/course/acct1000",
        }}
        position={4}
      />,
    );

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.getAttribute("href")).toBe("/course/ACCT1000");
    expect(link.className).toContain("focus-visible:ring-2");
  });

  it("encodes an unusual course code", () => {
    render(
      <CatalogCourseRow
        course={{ ...fullCourse, courseCode: "A/B 1", url: `${SITE_URL}/course/nope` }}
        position={1}
      />,
    );

    expect(screen.getByRole("link", { name: /A\/B 1/ }).getAttribute("href")).toBe(
      "/course/A%2FB%201",
    );
  });

  it("keeps a long bilingual title in the link without a nested card", () => {
    const titleEn = `Advanced ${"Methods ".repeat(30)}`;
    const titleZh = "計算方法導論".repeat(12);
    const { container } = render(
      <CatalogCourseRow
        course={{ ...fullCourse, titleEn, titleZh }}
        position={1}
      />,
    );

    const link = screen.getByRole("link", { name: /ACCT1000/ });
    expect(link.textContent).toContain(titleEn.trim());
    expect(link.textContent).toContain(titleZh);
    expect(link.className).toContain("min-w-0");
    expect(link.className).toContain("overflow-hidden");
    expect(container.querySelector("article")).toBeNull();
  });
});
