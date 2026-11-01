import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import WeekGrid from "@/components/timetable/week-grid";

const sections = [
  {
    key: "ACCT1000|CHAN|A01",
    courseCode: "ACCT1000",
    prof: "CHAN",
    section: "A01",
    color: "#2563eb",
    schedules: [
      { date: "MON" as const, time: "09:00-10:30", location: "E4-3052" },
    ],
  },
  {
    key: "CISC1000|LEE|B01",
    courseCode: "CISC1000",
    prof: "LEE",
    section: "B01",
    color: "#dc2626",
    schedules: [
      { date: "MON" as const, time: "10:00-11:00", location: "E11-1001" },
    ],
  },
];

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("WeekGrid", () => {
  it("renders day labels and events", () => {
    render(<WeekGrid sections={sections} />);
    expect(screen.getByText("MON")).toBeTruthy();
    expect(screen.getByText("ACCT1000-A01")).toBeTruthy();
    expect(screen.getByText("CISC1000-B01")).toBeTruthy();
  });

  it("marks conflicting events", () => {
    const view = render(<WeekGrid sections={sections} />);
    // 冲突描边改用文字/描边向的 --destructive-strong（--destructive 是"面"token，
    // 深色下当描边只有 2.00:1）
    const conflict = view.container.querySelector(".border-destructive-strong");
    expect(conflict).toBeTruthy();
  });

  it("hides location in compact mode", () => {
    render(<WeekGrid sections={sections} compact />);
    expect(screen.queryByText(/E11-1001/)).toBeNull();
  });

  it("hides the mini grid from assistive tech and makes it inert", () => {
    const view = render(<WeekGrid sections={sections} mini />);
    expect(view.container.querySelector('[aria-hidden="true"]')).toBeTruthy();
    expect(view.container.querySelector('[role="button"]')).toBeNull();
  });

  it("opens a block's reviews with Enter", () => {
    render(<WeekGrid sections={sections} />);
    const block = screen.getByText("ACCT1000-A01").closest('[role="button"]');
    expect(block).toBeTruthy();
    fireEvent.keyDown(block!, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/reviews/ACCT1000/CHAN");
  });
});
