import React from "react";
import { render, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { TrackSearchResults } from "@/components/analytics/track-search-results";

type Payload = Record<string, unknown>;

function pushed(): Payload[] {
  return (window as unknown as { dataLayer: Payload[] }).dataLayer;
}

beforeEach(() => {
  (window as unknown as { dataLayer?: Payload[] }).dataLayer = [];
});

afterEach(cleanup);

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
});
