import { describe, expect, it, vi } from "vitest";

import {
  SEARCH_CATALOG_TOOL_NAME,
} from "@/lib/assistant/search-catalog-ui";
import {
  applyCatalogFilter,
  collectCatalogResultSets,
  describeFilterScope,
  findCatalogResultSet,
  runFilterCatalogResults,
  summarizeCatalogResultSets,
  type CatalogResultSet,
} from "@/lib/assistant/catalog-result-sets";
import type { Message, ToolCall } from "@copilotkit/react-core/v2";
import { SITE_URL } from "@/lib/site";

const courseUrl = (code: string) => `${SITE_URL}/course/${code}`;

function call(id: string, args: Record<string, unknown> | string): ToolCall {
  const argumentsJson = typeof args === "string" ? args : JSON.stringify(args);
  return {
    id,
    type: "function",
    function: { name: SEARCH_CATALOG_TOOL_NAME, arguments: argumentsJson },
  };
}

function result(id: string, payload: unknown): Message {
  return {
    id: `t-${id}`,
    role: "tool",
    toolCallId: id,
    content: JSON.stringify(payload),
  };
}

function assistantMsg(...toolCalls: ToolCall[]): Message {
  return { role: "assistant", toolCalls };
}

function courses(n: number, offeredIndices: number[]) {
  const offeredSet = new Set(offeredIndices);
  const results = Array.from({ length: n }, (_, i) => {
    const num = i + 1;
    const courseCode = `MATH${1000 + num}`;
    return {
      courseCode,
      titleEn: `Course ${courseCode}`,
      titleZh: null,
      faculty: "SCI",
      department: "MATH",
      credits: "3",
      isOffered: offeredSet.has(i),
      url: courseUrl(courseCode),
    };
  });
  return {
    type: "course" as const,
    page: 1,
    hasMore: n < 127,
    totalCount: 127,
    results,
  };
}

function coursePayload(
  overrides: {
    totalCount?: number;
    hasMore?: boolean;
    results?: unknown[];
    type?: string;
  } = {},
) {
  return {
    type: "course",
    page: 1,
    hasMore: false,
    totalCount: 1,
    results: [
      {
        courseCode: "ACCT1000",
        titleEn: "Principles of Accounting I",
        titleZh: null,
        faculty: "FBA",
        department: "AIM",
        credits: "3",
        isOffered: true,
        url: courseUrl("ACCT1000"),
      },
    ],
    ...overrides,
  };
}

const user: Message = { role: "user", content: "find courses" };

const math = coursePayload({
  results: [
    {
      courseCode: "MATH1001",
      titleEn: "Calc I",
      titleZh: null,
      faculty: "SCI",
      department: "MATH",
      credits: "3",
      isOffered: false,
      url: courseUrl("MATH1001"),
    },
  ],
  totalCount: 1,
});

const acct = coursePayload({
  results: [
    {
      courseCode: "ACCT1000",
      titleEn: "Accounting",
      titleZh: null,
      faculty: "FBA",
      department: "AIM",
      credits: "3",
      isOffered: true,
      url: courseUrl("ACCT1000"),
    },
  ],
  totalCount: 1,
});

const filterSet: CatalogResultSet = {
  id: "filter-set",
  search: { query: "MATH" },
  totalCount: 10,
  hasMore: false,
  courses: courses(10, [1, 4]).results as CatalogResultSet["courses"],
};

const fourSets: CatalogResultSet[] = ["c1", "c2", "c3", "c4"].map((id, index) => ({
  id,
  search: { query: `q${index + 1}` },
  totalCount: id === "c4" ? 127 : 5 + index,
  hasMore: id === "c4",
  courses: (id === "c4" ? courses(10, [1, 4]) : courses(3, [0])).results as CatalogResultSet["courses"],
}));

describe("collectCatalogResultSets", () => {
  it("collects course result sets in call order with their search args", () => {
    const sets = collectCatalogResultSets([
      user,
      assistantMsg(call("c1", { type: "course", query: "MATH" })),
      result("c1", math),
      assistantMsg(call("c2", { type: "course", query: "ACCT" })),
      result("c2", acct),
    ]);
    expect(sets.map((s) => s.id)).toEqual(["c1", "c2"]);
    expect(sets[0].search).toEqual({ query: "MATH" });
  });

  it("orders result sets by call position when results arrive out of order", () => {
    const sets = collectCatalogResultSets([
      assistantMsg(call("c1", { query: "MATH" }), call("c2", { query: "ACCT" })),
      result("c2", acct),
      result("c1", math),
    ]);
    expect(sets.map((s) => s.id)).toEqual(["c1", "c2"]);
  });

  it("skips instructor, empty, failed, unanswered and non-search calls", () => {
    const instructor = {
      type: "instructor",
      page: 1,
      hasMore: false,
      totalCount: 1,
      results: [{ name: "CHAN TAI MAN", courseCount: 1, url: `${SITE_URL}/professor/CHAN` }],
    };
    const empty = { type: "course", page: 1, hasMore: false, totalCount: 0, results: [] };
    const sets = collectCatalogResultSets([
      assistantMsg(call("i1", { type: "instructor", query: "CHAN" })),
      result("i1", instructor),
      assistantMsg(call("e1", { query: "NONE" })),
      result("e1", empty),
      assistantMsg(call("f1", { query: "BAD" })),
      result("f1", "not-json"),
      assistantMsg(call("u1", { query: "PENDING" })),
      assistantMsg({
        id: "nav1",
        type: "function",
        function: { name: "navigate", arguments: "{}" },
      }),
      result("nav1", math),
    ]);
    expect(sets).toEqual([]);
  });

  it("ignores malformed call arguments", () => {
    const sets = collectCatalogResultSets([
      assistantMsg(call("c1", "{bad")),
      result("c1", math),
    ]);
    expect(sets).toHaveLength(1);
    expect(sets[0].search).toEqual({});
  });
});

describe("applyCatalogFilter", () => {
  it("filters to offered courses", () => {
    expect(applyCatalogFilter(filterSet.courses, "offered").map((c) => c.courseCode)).toEqual([
      "MATH1002",
      "MATH1005",
    ]);
    expect(applyCatalogFilter(filterSet.courses, "all")).toHaveLength(10);
  });
});

describe("describeFilterScope", () => {
  it.each([
    [
      { filter: "offered" as const, shown: 2, loaded: 10, totalCount: 127, hasMore: true },
      "Showing 2 offered courses among the 10 currently loaded results. There are 127 total matches. Other pages may include more offered courses.",
    ],
    [
      { filter: "offered" as const, shown: 1, loaded: 3, totalCount: 3, hasMore: false },
      "Showing 1 offered course of 3 results.",
    ],
    [
      { filter: "offered" as const, shown: 0, loaded: 10, totalCount: 10, hasMore: false },
      "None of the 10 loaded courses are marked offered this term.",
    ],
    [
      { filter: "all" as const, shown: 10, loaded: 10, totalCount: 127, hasMore: true },
      "",
    ],
  ] as const)("describes scope %#", (input, text) => {
    expect(describeFilterScope(input)).toBe(text);
  });
});

describe("summarizeCatalogResultSets", () => {
  it("summarises newest-first, at most 3 sets and 10 courses, with filters", () => {
    const json = JSON.parse(summarizeCatalogResultSets(fourSets, { c4: "offered" }));
    expect(json.resultSets.map((s: { resultSetId: string }) => s.resultSetId)).toEqual(["c4", "c3", "c2"]);
    expect(json.resultSets[0]).toMatchObject({
      newest: true,
      filter: "offered",
      loadedCount: 10,
      totalCount: 127,
      hasMore: true,
    });
    expect(json.resultSets[1].newest).toBe(false);
    expect(json.resultSets[0].courses[1]).toEqual({
      position: 2,
      courseCode: "MATH1002",
      isOffered: true,
    });
    expect(summarizeCatalogResultSets(fourSets, {})).not.toContain("\n");
    expect(summarizeCatalogResultSets(fourSets, {})).not.toContain("titleEn");
  });

  it("summarises no sets as a fixed sentence", () => {
    expect(summarizeCatalogResultSets([], {})).toBe("No course search results in this conversation");
  });
});

const filterMsgs: Message[] = [
  user,
  assistantMsg(call("c1", { query: "MATH" })),
  result("c1", courses(10, [1, 4])),
];

describe("runFilterCatalogResults", () => {
  it("applies a filter to a known result set and reports loaded-only scope", () => {
    const apply = vi.fn();
    expect(
      runFilterCatalogResults({ resultSetId: "c1", filter: "offered" }, filterMsgs, apply),
    ).toEqual({
      status: "applied",
      resultSetId: "c1",
      filter: "offered",
      shownCount: 2,
      loadedCount: 10,
      totalCount: 127,
      hasMore: true,
      shownCourseCodes: ["MATH1002", "MATH1005"],
      scope: "loaded_results_only",
    });
    expect(apply).toHaveBeenCalledWith("c1", "offered");
  });

  it("returns unknown_result_set for an id not in the current messages", () => {
    const apply = vi.fn();
    expect(
      runFilterCatalogResults({ resultSetId: "gone", filter: "offered" }, filterMsgs, apply),
    ).toEqual({ status: "unknown_result_set" });
    expect(apply).not.toHaveBeenCalled();
  });

  it("rejects invalid input", () => {
    expect(
      runFilterCatalogResults({ resultSetId: "", filter: "open" }, filterMsgs, vi.fn()),
    ).toEqual({ status: "invalid_request" });
  });
});

describe("findCatalogResultSet", () => {
  const msgs: Message[] = [
    user,
    assistantMsg(call("c1", { query: "MATH" })),
    result("c1", math),
    assistantMsg(call("c2", { query: "ACCT" })),
    result("c2", acct),
  ];

  it("finds a set by id only within the given messages", () => {
    expect(findCatalogResultSet(msgs, "c1")?.id).toBe("c1");
    expect(findCatalogResultSet(msgs, "other-conversation-id")).toBeUndefined();
  });
});
