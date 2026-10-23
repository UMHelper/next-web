import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CourseDetailToolResult } from "@/components/assistant/course-detail-tool-render";
import { SITE_URL, buildReviewPath } from "@/lib/site";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const fixture = {
  course: {
    courseCode: "APAC1000",
    titleEn: "Introduction to Public Administration",
    titleZh: "公共行政導論",
    credits: "3",
    faculty: "FSS",
    department: "GPA",
    programLevel: null,
    suggestedYear: null,
    medium: null,
    gradingSystem: null,
    courseType: null,
    duration: null,
    description: "Basics.",
    isOffered: true,
    url: `${SITE_URL}/course/APAC1000`,
  },
  page: 1,
  hasMore: false,
  totalCount: 2,
  instructors: [
    {
      name: "CHAN TAI MAN",
      commentCount: 12,
      result: null,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      isOffered: true,
      reviewUrl: `${SITE_URL}/review/APAC1000/CHAN%20TAI%20MAN`,
    },
    {
      name: "WONG KA KI",
      commentCount: 0,
      result: null,
      attendance: null,
      grade: null,
      difficulty: null,
      reward: null,
      isOffered: false,
      reviewUrl: `${SITE_URL}/review/APAC1000/WONG%20KA%20KI`,
    },
  ],
};

function instructorRow(name: string, index: number) {
  return {
    name,
    commentCount: index,
    result: null,
    attendance: null,
    grade: null,
    difficulty: null,
    reward: null,
    isOffered: false,
    reviewUrl: `${SITE_URL}/review/APAC1000/${encodeURIComponent(name)}`,
  };
}

let mockScrollHeight = 0;
let mockClientHeight = 0;

beforeEach(() => {
  class ResizeObserverMock {
    private callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }

    observe() {
      this.callback([], this as unknown as ResizeObserver);
    }

    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

  mockScrollHeight = 0;
  mockClientHeight = 0;
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return mockScrollHeight || (this as HTMLElement).textContent?.length || 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return mockClientHeight || (mockScrollHeight || (this as HTMLElement).textContent?.length || 0);
    },
  });
});

afterEach(() => {
  cleanup();
});

function renderCourseDetail(description: string) {
  const payload = {
    ...fixture,
    course: { ...fixture.course, description },
  };
  render(<CourseDetailToolResult status="complete" result={JSON.stringify(payload)} />);
  return screen.getByRole("article", { name: "APAC1000" });
}

function descriptionParagraph(card: HTMLElement) {
  const toggle = within(card).queryByRole("button", { name: /^(more|less)$/ });
  const paragraph = toggle?.previousElementSibling;
  expect(paragraph?.tagName).toBe("P");
  return paragraph as HTMLParagraphElement;
}

describe("CourseDetailToolResult", () => {
  it.each(["inProgress", "executing"] as const)("shows loading while %s", (status) => {
    render(<CourseDetailToolResult status={status} />);
    expect(screen.getByRole("status").textContent).toContain("Loading course details…");
  });

  it("renders code, both titles, facts, offering, description and links", () => {
    render(<CourseDetailToolResult status="complete" result={JSON.stringify(fixture)} />);
    const card = screen.getByRole("article", { name: "APAC1000" });
    expect(within(card).getByRole("heading", { name: "APAC1000" })).toBeTruthy();
    expect(within(card).getByText("公共行政導論")).toBeTruthy();
    expect(within(card).getByText("3 credits")).toBeTruthy();
    expect(within(card).getByText("Offered this term")).toBeTruthy();
    expect(within(card).getByText("Basics.")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "View course APAC1000" }).getAttribute("href")).toBe(
      "/course/APAC1000",
    );
    expect(
      within(card).getByRole("link", { name: "Reviews for APAC1000 by CHAN TAI MAN" }).getAttribute("href"),
    ).toBe(buildReviewPath("APAC1000", "CHAN TAI MAN"));
    expect(within(card).getByText("Teaching this term")).toBeTruthy();
  });

  it("omits null fields instead of printing placeholders", () => {
    const sparse = {
      ...fixture,
      course: { ...fixture.course, titleZh: null, credits: null, description: null },
      instructors: [],
      totalCount: 0,
    };
    render(<CourseDetailToolResult status="complete" result={JSON.stringify(sparse)} />);
    expect(screen.queryByText(/credits/)).toBeNull();
    expect(screen.queryByText("null")).toBeNull();
    expect(screen.getByText("No instructors recorded on this site.")).toBeTruthy();
  });

  it("shows the first 5 instructors and how many more exist", () => {
    const many = {
      ...fixture,
      totalCount: 7,
      instructors: Array.from({ length: 7 }, (_, index) =>
        instructorRow(`PROF ${index + 1}`, index),
      ),
    };
    render(<CourseDetailToolResult status="complete" result={JSON.stringify(many)} />);
    expect(screen.getAllByRole("link", { name: /^Reviews for APAC1000 by / })).toHaveLength(5);
    expect(screen.getByText("Showing 5 of 7 instructors")).toBeTruthy();
  });

  it.each([
    ["not_found", "That course isn't on this site."],
    ["temporarily_unavailable", "Course details are temporarily unavailable. Try again in a moment."],
    ["invalid_request", "Couldn't read the course details. Try rephrasing or ask again."],
  ] as const)("shows the %s alert", (error, text) => {
    render(<CourseDetailToolResult status="complete" result={JSON.stringify({ error })} />);
    expect(screen.getByRole("alert").textContent).toBe(text);
  });

  it("shows a clarification instead of a course-detail failure", () => {
    render(
      <CourseDetailToolResult
        status="complete"
        result={JSON.stringify({ status: "needs_clarification", ask: "Which course do you mean?" })}
      />,
    );
    expect(screen.getByText("Which course do you mean?")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("normalises a lower-case code before building links", () => {
    const lowered = {
      ...fixture,
      course: { ...fixture.course, courseCode: "apac1000 " },
    };
    render(<CourseDetailToolResult status="complete" result={JSON.stringify(lowered)} />);
    expect(screen.getByRole("link", { name: "View course APAC1000" }).getAttribute("href")).toBe(
      "/course/APAC1000",
    );
  });

  it("keeps a short description clamped without a more button", () => {
    mockScrollHeight = 40;
    mockClientHeight = 40;
    const card = renderCourseDetail("Basics.");
    const description = within(card).getByText("Basics.");
    expect(description.className).toContain("line-clamp-4");
    expect(within(card).queryByRole("button", { name: "more" })).toBeNull();
  });

  it("shows more when the clamped description overflows", async () => {
    mockScrollHeight = 200;
    mockClientHeight = 80;
    const long = "This is the first course in a three course sequence. ".repeat(8);
    const card = renderCourseDetail(long);
    const toggle = await waitFor(() => within(card).getByRole("button", { name: "more" }));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(descriptionParagraph(card).className).toContain("line-clamp-4");
  });

  it("expands and collapses the description", async () => {
    mockScrollHeight = 200;
    mockClientHeight = 80;
    const long = "Conceptual accounting topics. ".repeat(12);
    const card = renderCourseDetail(long);
    const toggle = await waitFor(() => within(card).getByRole("button", { name: "more" }));
    fireEvent.click(toggle);
    expect(within(card).getByRole("button", { name: "less" }).getAttribute("aria-expanded")).toBe("true");
    expect(descriptionParagraph(card).className).not.toContain("line-clamp-4");
    fireEvent.click(within(card).getByRole("button", { name: "less" }));
    expect(within(card).getByRole("button", { name: "more" }).getAttribute("aria-expanded")).toBe("false");
    expect(descriptionParagraph(card).className).toContain("line-clamp-4");
  });
});
