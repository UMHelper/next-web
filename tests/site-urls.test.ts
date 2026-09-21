import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  buildCatalogPath,
  buildCoursePath,
  buildProfessorPath,
  buildReviewPath,
  buildSearchPath,
} from "@/lib/site";

describe("site URL builders", () => {
  it("builds course and catalog paths", () => {
    expect(buildCoursePath("acct1000")).toBe("/course/ACCT1000");
    expect(buildCatalogPath(["fba", "aim"])).toBe("/catalog/FBA/AIM");
  });

  it("encodes professor path and review page suffix", () => {
    expect(buildProfessorPath("CHAN TAI/MAN")).toBe("/professor/CHAN%20TAI%2FMAN");
    expect(buildReviewPath("acct1000", "CHAN TAI/MAN")).toBe(
      "/reviews/ACCT1000/CHAN%20TAI%2FMAN",
    );
    expect(buildReviewPath("acct1000", "CHAN TAI/MAN", 3)).toBe(
      "/reviews/ACCT1000/CHAN%20TAI%2FMAN/page/3",
    );
  });

  it("builds search paths", () => {
    expect(buildSearchPath("course", "ACCT")).toBe("/search/course/ACCT");
    expect(buildSearchPath("instructor", "CHAN TAI MAN")).toBe(
      "/search/instructor/CHAN%20TAI%20MAN",
    );
  });

  it("builds absolute URLs", () => {
    expect(absoluteUrl("/course/ACCT1000")).toBe("https://umeh.top/course/ACCT1000");
  });
});
