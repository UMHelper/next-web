import React from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TrackSearchResults } from "@/components/analytics/track-search-results";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

let debug: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(() => {
  debug.mockRestore();
  cleanup();
});

describe("TrackSearchResults", () => {
  it("reports the result count once on mount", () => {
    render(<TrackSearchResults term="ACCT1000" scope="course" resultCount={7} />);
    expect(pushed()).toEqual([
      {
        event: "um_event",
        um_name: "view_search_results",
        search_term: "ACCT1000",
        search_scope: "course",
        result_count: 7,
        has_results: 1,
      },
    ]);
  });

  it("reports zero results", () => {
    render(<TrackSearchResults term="NOPE" scope="instructor" resultCount={0} />);
    expect(pushed()[0]).toMatchObject({ result_count: 0, has_results: 0 });
  });

  it("renders nothing", () => {
    const { container } = render(<TrackSearchResults term="ACCT1000" scope="course" resultCount={1} />);
    expect(container.innerHTML).toBe("");
  });

  it("does not report twice under StrictMode", () => {
    render(
      <React.StrictMode>
        <TrackSearchResults term="ACCT1000" scope="course" resultCount={7} />
      </React.StrictMode>,
    );
    expect(pushed()).toHaveLength(1);
  });

  it("does not report again when the result count changes", () => {
    const { rerender } = render(<TrackSearchResults term="ACCT1000" scope="course" resultCount={7} />);
    rerender(<TrackSearchResults term="ACCT1000" scope="course" resultCount={2} />);
    expect(pushed()).toHaveLength(1);
  });

  it("reports once more when it is unmounted and mounted again", () => {
    const first = render(<TrackSearchResults term="ACCT1000" scope="course" resultCount={7} />);
    expect(pushed()).toHaveLength(1);

    first.unmount();

    // 重新挂载是一次"新挂载"：去重只针对同一个组件实例，不能跨挂载共享
    render(<TrackSearchResults term="ACCT1000" scope="course" resultCount={7} />);
    expect(pushed()).toHaveLength(2);
    expect(pushed()[1]).toEqual(pushed()[0]);
  });
});
