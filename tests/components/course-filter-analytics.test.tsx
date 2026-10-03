import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import CourseFilter from "@/components/course-filter";
import { courseKeysToCount } from "@/lib/count-unique-values";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

const CIS_COURSE = {
  New_code: "COMP1001",
  courseTitleEng: "A",
  courseTitleChi: "A",
  Credits: "3",
  Offering_Unit: "FST",
  Offering_Department: "CIS",
  Medium_of_Instruction: "English",
  Is_Offered: 1,
};

const ACC_COURSE = {
  New_code: "ACCT1000",
  courseTitleEng: "B",
  courseTitleChi: "B",
  Credits: "3",
  Offering_Unit: "FBA",
  Offering_Department: "ACC",
  Medium_of_Instruction: "Chinese",
  Is_Offered: 0,
};

/** Radix Select 需要这几个 DOM API 才能在 jsdom 里交互。 */
beforeAll(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.scrollIntoView = () => {};
});

let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(() => {
  debug.mockRestore();
  cleanup();
});

/** 下拉的渲染顺序由 courseKeysToCount 决定（组件里就是按它 map 的）。 */
function openSelectFor(key: string): void {
  const combos = screen.getAllByRole("combobox") as HTMLButtonElement[];
  const combo = combos[courseKeysToCount.indexOf(key as (typeof courseKeysToCount)[number])];
  expect(combo, `combobox for ${key}`).toBeTruthy();
  fireEvent.click(combo);
}

describe("CourseFilter analytics", () => {
  it("reports filter_apply with the post-filter result count", async () => {
    render(<CourseFilter data={[CIS_COURSE, ACC_COURSE]} ads={null} listName="search_course" />);

    openSelectFor("Offering_Department");
    const option = (await screen.findAllByRole("option")).find((item) => item.textContent === "ACC");
    expect(option).toBeTruthy();
    fireEvent.click(option!);

    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "filter_apply",
        filter_name: "Offering_Department",
        filter_value: "ACC",
        result_count: 1,
      },
    ]);
    // 行为也真的生效了：只剩 ACC 那门课
    expect(screen.queryByText("COMP1001")).toBeNull();
    expect(screen.queryByText("ACCT1000")).toBeTruthy();
  });

  it("reports the offered label rather than the numeric flag for Is_Offered", async () => {
    render(<CourseFilter data={[CIS_COURSE, ACC_COURSE]} ads={null} listName="search_course" />);

    openSelectFor("Is_Offered");
    const options = await screen.findAllByRole("option");
    const labels = options.map((item) => item.textContent);
    // 该维度有两个取值，所以下拉可用、且 All 在列
    expect(labels).toContain("All");
    expect(labels).toContain("Offered");

    fireEvent.click(options.find((item) => item.textContent === "Offered")!);

    // 口径是 UI 标签 "Offered"，不是状态里那个数字 1
    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "filter_apply",
        filter_name: "Is_Offered",
        filter_value: "Offered",
        result_count: 1,
      },
    ]);
    expect(screen.queryByText("COMP1001")).toBeTruthy();
    expect(screen.queryByText("ACCT1000")).toBeNull();
  });

  it("reports filter_apply when a dimension is cleared back to All", async () => {
    render(<CourseFilter data={[CIS_COURSE, ACC_COURSE]} ads={null} listName="search_course" />);

    openSelectFor("Offering_Department");
    fireEvent.click((await screen.findAllByRole("option")).find((item) => item.textContent === "ACC")!);

    openSelectFor("Offering_Department");
    fireEvent.click((await screen.findAllByRole("option")).find((item) => item.textContent === "All")!);

    // 先钉住条数：缺了这条，pushed()[1] 在没上报第二次时会静默变成 undefined，
    // toMatchObject(undefined) 反而直接报错或误判。
    expect(pushed()).toHaveLength(2);
    expect(pushed()[1]).toMatchObject({
      filter_name: "Offering_Department",
      filter_value: "All",
      result_count: 2,
    });
  });

  it("reports the search results once when trackResults is provided", () => {
    render(
      <CourseFilter
        data={[CIS_COURSE, ACC_COURSE]}
        ads={null}
        listName="search_course"
        trackResults={{ term: "CIS", scope: "course" }}
      />,
    );

    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "view_search_results",
        search_term: "CIS",
        search_scope: "course",
        result_count: 2,
        has_results: 1,
      },
    ]);
  });

  it("reports the search results only once under StrictMode", () => {
    render(
      <React.StrictMode>
        <CourseFilter
          data={[CIS_COURSE, ACC_COURSE]}
          ads={null}
          listName="search_course"
          trackResults={{ term: "CIS", scope: "course" }}
        />
      </React.StrictMode>,
    );

    // StrictMode 会双执行 effect，但 view_search_results 只应上报一次
    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "view_search_results",
        search_term: "CIS",
        search_scope: "course",
        result_count: 2,
        has_results: 1,
      },
    ]);
  });

  it("reports zero results for an empty result set", () => {
    render(
      <CourseFilter data={[]} ads={null} listName="search_course" trackResults={{ term: "NOPE", scope: "course" }} />,
    );

    expect(pushed()).toHaveLength(1);
    expect(pushed()[0]).toMatchObject({ result_count: 0, has_results: 0 });
  });

  it("stays silent on the catalog page (no trackResults)", () => {
    render(<CourseFilter data={[CIS_COURSE, ACC_COURSE]} ads={null} listName="catalog" />);
    expect(pushed()).toHaveLength(0);
  });
});
