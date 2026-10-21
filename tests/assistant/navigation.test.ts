import { describe, expect, it } from "vitest";

import { buildNavigationPath, parseDestination } from "@/lib/assistant/navigation";
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
