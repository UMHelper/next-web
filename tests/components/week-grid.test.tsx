import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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
    const conflict = view.container.querySelector(".border-red-500");
    expect(conflict).toBeTruthy();
  });

  it("hides location in compact mode", () => {
    render(<WeekGrid sections={sections} compact />);
    expect(screen.queryByText(/E11-1001/)).toBeNull();
  });
});
