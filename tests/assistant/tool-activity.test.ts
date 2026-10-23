import { describe, expect, it } from "vitest";

import { classifyToolContent, toolActivityStatus } from "@/lib/assistant/tool-activity";
import { SITE_URL } from "@/lib/site";

const emptyCatalog = JSON.stringify({
  type: "course",
  page: 1,
  hasMore: false,
  totalCount: 0,
  results: [],
});

const emptySections = JSON.stringify({
  courseCode: "APAC1000",
  instructor: "CHAN TAI MAN",
  courseUrl: `${SITE_URL}/course/APAC1000`,
  sections: [],
});

const emptyInstructor = JSON.stringify({
  name: "CHAN TAI MAN",
  page: 1,
  hasMore: false,
  totalCount: 0,
  courses: [],
});

const emptyReviews = JSON.stringify({
  courseCode: "ACCT1000",
  instructor: "CHAN TAI MAN",
  page: 1,
  hasMore: false,
  url: `${SITE_URL}/reviews/ACCT1000/CHAN%20TAI%20MAN`,
  reviews: [],
});

const appliedEmptyFilter = JSON.stringify({
  status: "applied",
  resultSetId: "call-1",
  filter: "offered",
  shownCount: 0,
  loadedCount: 4,
  totalCount: 4,
  hasMore: false,
  shownCourseCodes: [],
  scope: "loaded_results_only",
});

describe("classifyToolContent", () => {
  it.each([
    ["search_catalog", '{"error":"not_found"}'],
    ["get_course", '{"error":"not_found"}'],
    ["get_course_sections", '{"error":"not_found"}'],
    ["get_instructor", '{"error":"not_found"}'],
    ["get_course_reviews", '{"error":"not_found"}'],
    ["search_catalog", '{"error":"temporarily_unavailable"}'],
    ["get_course", '{"error":"invalid_request"}'],
    ["filter_catalog_results", '{"status":"unknown_result_set"}'],
    ["filter_catalog_results", '{"status":"invalid_request"}'],
    ["check_plan_conflicts", '{"found":false,"error":"request_failed"}'],
  ] as const)("classifies %s domain failure %s", (name, content) => {
    expect(classifyToolContent(name, content)).toBe("domain_error");
  });

  it.each([
    ["search_catalog", emptyCatalog],
    ["get_course_sections", emptySections],
    ["get_instructor", emptyInstructor],
    ["get_course_reviews", emptyReviews],
    ["filter_catalog_results", appliedEmptyFilter],
    ["check_plan_conflicts", '{"found":false}'],
    ["check_plan_conflicts", '{"found":true,"conflicts":[]}'],
    ["unknown_tool", '{"ok":true}'],
  ] as const)("classifies %s success %s", (name, content) => {
    expect(classifyToolContent(name, content)).toBe("success");
  });

  it.each([
    ["search_catalog", "{not json"],
    ["get_course", '{"unexpected":1}'],
    ["filter_catalog_results", "{}"],
    ["check_plan_conflicts", '{"found":false,"error":"request_failed","extra":1}'],
    ["get_instructor", ""],
  ] as const)("classifies %s malformed %s", (name, content) => {
    expect(classifyToolContent(name, content)).toBe("malformed");
  });
});

describe("toolActivityStatus", () => {
  it("is pending when the turn is idle and no result arrived", () => {
    expect(toolActivityStatus("search_catalog", undefined, false)).toBe("pending");
  });

  it("is running when this turn is active and no result arrived", () => {
    expect(toolActivityStatus("search_catalog", undefined, true)).toBe("running");
  });

  it("stays done for a finished call even if the agent is still running", () => {
    expect(
      toolActivityStatus("search_catalog", { content: emptyCatalog }, true),
    ).toBe("done");
  });

  it("is an error for a transport failure even when the body is a valid success", () => {
    expect(
      toolActivityStatus(
        "search_catalog",
        { content: emptyCatalog, error: "timeout" },
        false,
      ),
    ).toBe("error");
  });

  it("is an error for a domain failure and for malformed JSON", () => {
    expect(
      toolActivityStatus("get_course", { content: '{"error":"not_found"}' }, false),
    ).toBe("error");
    expect(
      toolActivityStatus("search_catalog", { content: "{not json" }, false),
    ).toBe("error");
  });

  it("is an error when the tool content is not a string", () => {
    expect(
      toolActivityStatus("search_catalog", { content: [] }, false),
    ).toBe("error");
  });
});
