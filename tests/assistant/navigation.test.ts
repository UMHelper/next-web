import { describe, expect, it, vi } from "vitest";

import {
  NAVIGATE_DESCRIPTION,
  buildNavigationPath,
  navigationsSinceLastUserMessage,
  parseDestination,
  samePage,
  verifyDestination,
} from "@/lib/assistant/navigation";
import { describePage } from "@/lib/assistant/page-context";

const CO_TAUGHT = "LI ZIHAO / WONG KA KI KATRINE";
const observed = (path: string) => new URL(path, "https://umeh.top").pathname;

describe("parseDestination", () => {
  it.each([
    [{ destination: "course", code: " acct1000 " }, { destination: "course", code: "ACCT1000" }],
    [{ destination: "professor", instructor: "chan  tai man" }, { destination: "professor", instructor: "CHAN TAI MAN" }],
    [{ destination: "reviews", code: "GELH2009", instructor: CO_TAUGHT }, { destination: "reviews", code: "GELH2009", instructor: CO_TAUGHT }],
    [{ destination: "catalog" }, { destination: "catalog" }],
    [{ destination: "catalog", faculty: "fst" }, { destination: "catalog", faculty: "FST" }],
    [{ destination: "catalog", faculty: "FST", department: "cis" }, { destination: "catalog", faculty: "FST", department: "CIS" }],
    [{ destination: "catalog", faculty: "GECOURSE" }, { destination: "catalog", faculty: "gecourse" }],
    [{ destination: "timetable" }, { destination: "timetable" }],
    [{ destination: "timetable", code: null, instructor: "" }, { destination: "timetable" }],
  ])("accepts %j", (input, expected) => {
    expect(parseDestination(input)).toEqual(expected);
  });

  it.each([
    ["no destination", { code: "ACCT1000" }],
    ["unknown destination", { destination: "admin" }],
    ["url destination", { destination: "url", url: "https://evil.example" }],
    ["unknown key", { destination: "timetable", path: "/admin" }],
    ["field from another destination", { destination: "course", code: "ACCT1000", instructor: "CHAN TAI MAN" }],
    ["missing code", { destination: "course" }],
    ["malformed code", { destination: "course", code: "ACCT1000/../../admin" }],
    ["code with query", { destination: "course", code: "ACCT1000?x=1" }],
    ["missing instructor", { destination: "reviews", code: "ACCT1000" }],
    ["instructor with dollar", { destination: "professor", instructor: "CHAN $ TAI" }],
    ["instructor with percent", { destination: "professor", instructor: "CHAN%2FTAI" }],
    ["instructor with hash", { destination: "professor", instructor: "CHAN#TAI" }],
    ["instructor starting with dots", { destination: "professor", instructor: "../ADMIN" }],
    ["instructor in Chinese", { destination: "professor", instructor: "陳大文" }],
    ["instructor too long", { destination: "professor", instructor: "A".repeat(81) }],
    ["unknown faculty", { destination: "catalog", faculty: "ADMIN" }],
    ["department outside faculty", { destination: "catalog", faculty: "FST", department: "ACC" }],
    ["department without faculty", { destination: "catalog", department: "CIS" }],
    ["not an object", "ACCT1000"],
  ])("rejects %s", (_name, input) => {
    expect(parseDestination(input)).toBeNull();
  });
});

describe("buildNavigationPath", () => {
  it.each([
    [{ destination: "course", code: "ACCT1000" }, "/course/ACCT1000"],
    [{ destination: "professor", instructor: "CHAN TAI MAN" }, "/professor/CHAN%20TAI%20MAN"],
    [{ destination: "professor", instructor: CO_TAUGHT }, "/professor/LI%20ZIHAO%20$%20WONG%20KA%20KI%20KATRINE"],
    [{ destination: "reviews", code: "GELH2009", instructor: CO_TAUGHT }, "/reviews/GELH2009/LI%20ZIHAO%20$%20WONG%20KA%20KI%20KATRINE"],
    [{ destination: "reviews", code: "ACCT1000", instructor: "O'NEIL, J." }, "/reviews/ACCT1000/O'NEIL%2C%20J."],
    [{ destination: "catalog" }, "/catalog"],
    [{ destination: "catalog", faculty: "FST" }, "/catalog/FST"],
    [{ destination: "catalog", faculty: "FST", department: "CIS" }, "/catalog/FST/CIS"],
    [{ destination: "catalog", faculty: "gecourse" }, "/catalog/gecourse"],
    [{ destination: "timetable" }, "/timetable"],
  ] as const)("builds %j", (destination, path) => {
    expect(buildNavigationPath(destination)).toBe(path);
  });

  it.each([
    [{ destination: "course", code: "ACCT1000" }, { page: "course", courseCode: "ACCT1000" }],
    [{ destination: "professor", instructor: CO_TAUGHT }, { page: "instructor", instructor: CO_TAUGHT }],
    [{ destination: "reviews", code: "GELH2009", instructor: CO_TAUGHT }, { page: "course_reviews", courseCode: "GELH2009", instructor: CO_TAUGHT }],
    [{ destination: "reviews", code: "ACCT1000", instructor: "O'NEIL, J." }, { page: "course_reviews", courseCode: "ACCT1000", instructor: "O'NEIL, J." }],
    [{ destination: "reviews", code: "ACCT1000", instructor: "JOSÉ MARÍA" }, { page: "course_reviews", courseCode: "ACCT1000", instructor: "JOSÉ MARÍA" }],
    [{ destination: "catalog", faculty: "FST", department: "CIS" }, { page: "catalog", faculty: "FST", department: "CIS" }],
    [{ destination: "catalog", faculty: "gecourse" }, { page: "catalog", faculty: "gecourse" }],
    [{ destination: "timetable" }, { page: "timetable" }],
  ] as const)("round-trips %j through the browser URL and describePage", (destination, page) => {
    expect(describePage(observed(buildNavigationPath(destination)))).toEqual(page);
  });

  it("only ever builds same-origin paths under the allowed roots", () => {
    const names = ["A", CO_TAUGHT, "O'NEIL, J.", "(VISITING) SMITH-JONES", "A.B.C"];
    const paths = [
      ...names.flatMap((instructor) => [
        buildNavigationPath({ destination: "professor", instructor }),
        buildNavigationPath({ destination: "reviews", code: "ACCT1000", instructor }),
      ]),
      buildNavigationPath({ destination: "catalog" }),
      buildNavigationPath({ destination: "timetable" }),
    ];
    for (const path of paths) {
      expect(path).toMatch(/^\/(course|professor|reviews|catalog|timetable)(\/|$)/);
      expect(path).not.toMatch(/\/\/|\?|#|\.\.|%2F/i);
      expect(new URL(path, "https://umeh.top").origin).toBe("https://umeh.top");
    }
  });
});

const lookups = (overrides: Partial<Parameters<typeof verifyDestination>[1]> = {}) => ({
  getCourseDetail: vi.fn(async () => ({ course: { courseTitle: "Financial Accounting" }, profList: [{}], isOffer: true })),
  getInstructorCourses: vi.fn(async () => ({ courses: [{ course_id: "GELH2009" }] })),
  ...overrides,
});

describe("verifyDestination", () => {
  it("finds a course with a title or instructors", async () => {
    expect(await verifyDestination({ destination: "course", code: "ACCT1000" }, lookups())).toBe("exists");
    const noOffer = lookups({ getCourseDetail: vi.fn(async () => ({ course: { courseTitle: "Old Course" }, profList: [], isOffer: false })) });
    expect(await verifyDestination({ destination: "course", code: "ACCT1000" }, noOffer)).toBe("exists");
  });

  it("reports a course the catalog does not know", async () => {
    const unknown = lookups({ getCourseDetail: vi.fn(async () => ({ course: { courseTitle: "Unknown Course" }, profList: [], isOffer: false })) });
    expect(await verifyDestination({ destination: "course", code: "ZZZZ9999" }, unknown)).toBe("missing");
  });

  it("passes the decoded instructor name to the lookup, slash included", async () => {
    const deps = lookups();
    await verifyDestination({ destination: "professor", instructor: "LI ZIHAO / WONG KA KI KATRINE" }, deps);
    expect(deps.getInstructorCourses).toHaveBeenCalledWith("LI ZIHAO / WONG KA KI KATRINE");
  });

  it("reports an instructor with no courses", async () => {
    const none = lookups({ getInstructorCourses: vi.fn(async () => ({ courses: [] })) });
    expect(await verifyDestination({ destination: "professor", instructor: "NOBODY" }, none)).toBe("missing");
  });

  it("requires the instructor to teach the course for reviews", async () => {
    const deps = lookups();
    expect(await verifyDestination({ destination: "reviews", code: "GELH2009", instructor: "A" }, deps)).toBe("exists");
    expect(await verifyDestination({ destination: "reviews", code: "ACCT1000", instructor: "A" }, deps)).toBe("missing");
  });

  it("does not call the network for catalog and timetable", async () => {
    const deps = lookups();
    expect(await verifyDestination({ destination: "catalog", faculty: "FST" }, deps)).toBe("exists");
    expect(await verifyDestination({ destination: "timetable" }, deps)).toBe("exists");
    expect(deps.getCourseDetail).not.toHaveBeenCalled();
    expect(deps.getInstructorCourses).not.toHaveBeenCalled();
  });

  it("treats lookup failures as unavailable, not missing", async () => {
    const failing = lookups({ getCourseDetail: vi.fn(async () => { throw new Error("401"); }) });
    expect(await verifyDestination({ destination: "course", code: "ACCT1000" }, failing)).toBe("unavailable");
  });
});

describe("navigationsSinceLastUserMessage", () => {
  const call = (id: string, name = "navigate") => ({ id, type: "function", function: { name, arguments: "{}" } });
  const result = (toolCallId: string, status: string) => ({
    role: "tool",
    toolCallId,
    content: JSON.stringify({ status }),
  });

  it("counts pages opened after the latest user message only", () => {
    const messages = [
      { role: "user" },
      { role: "assistant", toolCalls: [call("old")] },
      result("old", "navigated"),
      { role: "user" },
      { role: "assistant", toolCalls: [call("course", "get_course"), call("first")] },
      result("course", "navigated"),
      result("first", "navigated"),
      { role: "assistant", toolCalls: [call("pending")] },
    ];
    expect(navigationsSinceLastUserMessage(messages)).toBe(1);
  });

  it.each(["navigated", "landed_elsewhere", "timeout"])("counts a %s result as an opened page", (status) => {
    const messages = [{ role: "user" }, { role: "assistant", toolCalls: [call("a")] }, result("a", status)];
    expect(navigationsSinceLastUserMessage(messages)).toBe(1);
  });

  it.each(["already_here", "not_found", "unavailable", "invalid_destination", "busy", "cancelled", "limit_reached"])(
    "does not count a %s result",
    (status) => {
      const messages = [{ role: "user" }, { role: "assistant", toolCalls: [call("a")] }, result("a", status)];
      expect(navigationsSinceLastUserMessage(messages)).toBe(0);
    },
  );

  it("ignores results that are not JSON", () => {
    const messages = [
      { role: "user" },
      { role: "assistant", toolCalls: [call("a")] },
      { role: "tool", toolCallId: "a", content: "Error: boom" },
    ];
    expect(navigationsSinceLastUserMessage(messages)).toBe(0);
  });
});

describe("samePage", () => {
  it("compares page descriptions by value", () => {
    expect(samePage({ page: "course", courseCode: "ACCT1000" }, { page: "course", courseCode: "ACCT1000" })).toBe(true);
    expect(samePage({ page: "course", courseCode: "ACCT1000" }, { page: "course", courseCode: "ECON1001" })).toBe(false);
  });
});

describe("NAVIGATE_DESCRIPTION", () => {
  it("covers natural page requests and keeps the tool's limits", () => {
    expect(NAVIGATE_DESCRIPTION).toContain("asks to be taken to, open, see or look at one of these pages, in any language");
    expect(NAVIGATE_DESCRIPTION).toContain("Do not call it to answer a question about a course or instructor");
    expect(NAVIGATE_DESCRIPTION).toContain("It cannot open other sites and never changes the timetable");
  });

  it("only opens a page whose values are known, never a substitute, and reports the status", () => {
    expect(NAVIGATE_DESCRIPTION).toContain("and you already know every value the page needs");
    expect(NAVIGATE_DESCRIPTION).toContain("A reviews page needs the course code and exactly one instructor who taught it");
    expect(NAVIGATE_DESCRIPTION).toContain("ask the student instead of choosing");
    expect(NAVIGATE_DESCRIPTION).toContain("never open the course page in its place");
    expect(NAVIGATE_DESCRIPTION).toContain("report that status");
  });
});
