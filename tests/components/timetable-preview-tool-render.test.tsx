import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TimetablePreviewToolResult } from "@/components/assistant/timetable-preview-tool-render";
import { runPreviewTimetable } from "@/lib/assistant/timetable-preview";
import type { TimetableToolDeps } from "@/lib/assistant/timetable-tools";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import { timetableVersion } from "@/lib/timetable/analysis";
import { McpToolError } from "@/lib/mcp/errors";
import type { GetCourseSectionsOutput } from "@/lib/mcp/schemas";
import { buildReviewPath } from "@/lib/site";
import { FIXTURE_CATALOG_SECTIONS, FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const fixtureLookup = (code: string, instructor: string): GetCourseSectionsOutput | undefined =>
  FIXTURE_CATALOG_SECTIONS.find(
    (entry) => entry.courseCode === code.toUpperCase() && entry.instructor === instructor,
  );

const readyState = (planSections = FIXTURE_PLAN.payload.sections, planTerm = { year: 2026, sem: 1 }): TimetableState => ({
  status: "ready",
  plan: {
    name: FIXTURE_PLAN.name,
    year: planTerm.year,
    sem: planTerm.sem,
    sections: planSections,
  },
  currentTerm: { year: 2026, sem: 1 },
  otherPlansThisTerm: 0,
  localOnly: false,
  truncated: false,
  version: timetableVersion(planSections),
});

const deps = (overrides?: Partial<TimetableToolDeps>): TimetableToolDeps => ({
  loadSections: async (input) => {
    const match = fixtureLookup(input.code, input.instructor);
    if (!match) throw new McpToolError("not_found");
    return match;
  },
  loadCatalogTerm: async () => ({ year: 2026, sem: 1 }),
  ...overrides,
});

afterEach(() => {
  cleanup();
});

describe("TimetablePreviewToolResult", () => {
  it("renders a saved preview with term, five day tabs and the conflict day selected", async () => {
    const payload = await runPreviewTimetable(readyState(), {}, deps());
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);

    expect(screen.getByRole("region", { name: "Saved timetable preview" })).toBeTruthy();
    expect(screen.getByText("My plan · 2026/2027 AY Sem 1")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tuesday, 2 classes, has a conflict" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByText("Overlaps ECON1001-001 10:00–10:15")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open My Timetable" }).getAttribute("href")).toBe("/timetable");
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  it("moves between days with the arrow keys and shows gaps", async () => {
    const payload = await runPreviewTimetable(readyState(), {}, deps());
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);

    const monTab = screen.getByRole("tab", { name: /Monday/ });
    monTab.focus();
    fireEvent.keyDown(monTab, { key: "Home" });
    expect(screen.getByRole("tab", { name: /Monday/ }).getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: /Monday/ }));
    expect(screen.getByText("Free 11:15–14:00 · 2h 45m")).toBeTruthy();
  });

  it("labels a hypothetical preview as not saved and names the replacement", async () => {
    const payload = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING", section: "001" }] },
      deps(),
    );
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);

    expect(screen.getByRole("region", { name: "Hypothetical timetable preview" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Preview · Not saved" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /Monday/ }));
    expect(screen.getByText("Replaces MATH1010-002")).toBeTruthy();
    expect(screen.getByText("Added in preview")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open My Timetable" })).toBeNull();
  });

  it("lists a meeting outside the week grid hours", async () => {
    const eveningSection: GetCourseSectionsOutput = {
      courseCode: "EVEN1001",
      instructor: "LEE KA",
      courseUrl: "https://umeh.top/course/EVEN1001",
      sections: [
        {
          section: "001",
          courseUrl: "https://umeh.top/course/EVEN1001",
          schedules: [{ weekday: "FRI", startTime: "19:00", endTime: "21:30", location: "E11-1001" }],
        },
      ],
    };
    const payload = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "EVEN1001", instructor: "LEE KA" }] },
      deps({
        loadSections: async () => eveningSection,
      }),
    );
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);

    fireEvent.click(screen.getByRole("tab", { name: /Friday/ }));
    expect(screen.getByText("19:00–21:30")).toBeTruthy();
  });

  it("lists sections without class times", async () => {
    const payload = await runPreviewTimetable(readyState(), {}, deps());
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);

    expect(screen.getByText("No class times listed: GEND1001-001")).toBeTruthy();
  });

  it("shows section choices as text without a grid", async () => {
    const payload = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "HO SIU MING" }] },
      deps(),
    );
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);

    expect(screen.getByText("Pick a section of MATH1010 (HO SIU MING):")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("shows the no_plan message", async () => {
    const payload = await runPreviewTimetable({ status: "no_plan", currentTerm: { year: 2026, sem: 1 } }, {}, deps());
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);
    expect(screen.getByText("You don't have a saved timetable yet.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /timetable/i }).getAttribute("href")).toBe("/timetable");
  });

  it("shows the loading message", async () => {
    const payload = await runPreviewTimetable({ status: "loading" }, {}, deps());
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);
    expect(screen.getByText("Your timetable is still loading. Ask again in a moment.")).toBeTruthy();
  });

  it("shows the unavailable message", async () => {
    const payload = await runPreviewTimetable({ status: "unavailable" }, {}, deps());
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);
    expect(screen.getByRole("alert").textContent).toBe("Couldn't read your timetable.");
  });

  it("shows the term_mismatch message", async () => {
    const payload = await runPreviewTimetable(
      readyState(FIXTURE_PLAN.payload.sections, { year: 2025, sem: 2 }),
      {},
      deps(),
    );
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);
    expect(
      screen.getByText(
        "Your timetable is for 2025/2026 AY Sem 2; class times are only available for 2026/2027 AY Sem 1.",
      ),
    ).toBeTruthy();
  });

  it("shows the not_found message", async () => {
    const payload = await runPreviewTimetable(
      readyState(),
      { add: [{ code: "MATH1010", instructor: "NOBODY", section: "001" }] },
      deps(),
    );
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);
    expect(screen.getByText("No such section on this site.")).toBeTruthy();
  });

  it("shows a failure alert for malformed content", () => {
    render(<TimetablePreviewToolResult status="complete" result="{not json" />);
    expect(screen.getByRole("alert").textContent).toBe("Couldn't build the timetable preview.");
  });

  it.each(["inProgress", "executing"] as const)("shows a status row while building", (status) => {
    render(<TimetablePreviewToolResult status={status} />);
    expect(screen.getByRole("status").textContent).toContain("Building timetable preview…");
  });

  it("links class rows to reviews", async () => {
    const payload = await runPreviewTimetable(readyState(), {}, deps());
    render(<TimetablePreviewToolResult status="complete" result={JSON.stringify(payload)} />);

    const link = screen.getByRole("link", { name: "CISC2001-001" });
    expect(link.getAttribute("href")).toBe(buildReviewPath("CISC2001", "WONG KA KI"));
  });
});
