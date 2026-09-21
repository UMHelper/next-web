import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CourseLoading from "../../app/course/[code]/loading";
import ReviewLoading from "../../app/reviews/[code]/[...prof]/loading";

function countSkeletonBlocks(html: string) {
  return (html.match(/data-slot="skeleton"/g) ?? []).length;
}

describe("SSR route loading skeletons", () => {
  it("renders a multi-block skeleton for the course route", () => {
    const html = renderToStaticMarkup(React.createElement(CourseLoading));

    expect(countSkeletonBlocks(html)).toBeGreaterThanOrEqual(10);
  });

  it("renders header and comment skeletons for the review route", () => {
    const html = renderToStaticMarkup(React.createElement(ReviewLoading));

    expect(countSkeletonBlocks(html)).toBeGreaterThanOrEqual(10);
  });
});
