import { describe, expect, it } from "vitest";
import { parseReviewRoute } from "@/lib/review-route";

describe("parseReviewRoute", () => {
  it("prefers a valid ?page query", () => {
    const result = parseReviewRoute("acct1000", ["CHAN%20TAI%20MAN"], "2");
    expect(result).toEqual({ code: "ACCT1000", prof: "CHAN%20TAI%20MAN", page: 2 });
  });

  it("falls back to a trailing numeric path segment", () => {
    const result = parseReviewRoute("ACCT1000", ["CHAN%20TAI%20MAN", "3"]);
    expect(result).toEqual({ code: "ACCT1000", prof: "CHAN%20TAI%20MAN", page: 3 });
  });

  it("ignores invalid page values", () => {
    expect(parseReviewRoute("ACCT1000", ["CHAN"], "0").page).toBe(1);
    expect(parseReviewRoute("ACCT1000", ["CHAN"], "abc").page).toBe(1);
    expect(parseReviewRoute("ACCT1000", ["CHAN"], "2abc").page).toBe(1);
  });

  it("does not mutate the input segment array", () => {
    const segments = Object.freeze(["CHAN", "2"]);
    const result = parseReviewRoute("ACCT1000", segments);
    expect(result.prof).toBe("CHAN");
    expect(segments).toEqual(["CHAN", "2"]);
  });

  it("normalizes %2C and uppercase", () => {
    const result = parseReviewRoute("acct1000", ["chan%2Ctai"]);
    expect(result.prof).toBe("CHAN,TAI");
    expect(result.code).toBe("ACCT1000");
  });
});
