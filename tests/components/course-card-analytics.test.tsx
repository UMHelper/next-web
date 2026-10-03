import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

import CourseCard from "@/components/course-card";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

const COURSE = {
  New_code: "COMP1001",
  courseTitleEng: "Intro to Computing",
  courseTitleChi: "計算機導論",
  Credits: "3",
  Offering_Unit: "FST",
  Offering_Department: "CIS",
  Is_Offered: 1,
};

let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(() => {
  debug.mockRestore();
  cleanup();
});

describe("CourseCard analytics", () => {
  it("keeps linking to the course page", () => {
    render(<CourseCard data={COURSE} listName="catalog" position={4} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/course/COMP1001");
  });

  it("reports select_item with the list name, position and faculty", () => {
    render(<CourseCard data={COURSE} listName="search_course" position={4} />);
    fireEvent.click(screen.getByRole("link"));

    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "select_item",
        item_id: "COMP1001",
        item_list_name: "search_course",
        position: 4,
        faculty: "FST",
      },
    ]);
  });

  it("omits faculty when the course row has no Offering_Unit", () => {
    render(<CourseCard data={{ ...COURSE, Offering_Unit: undefined }} listName="catalog" position={0} />);
    fireEvent.click(screen.getByRole("link"));
    expect(pushed()[0]).not.toHaveProperty("faculty");
  });
});
