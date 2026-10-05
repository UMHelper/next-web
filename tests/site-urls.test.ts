import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  absoluteUrl,
  buildCatalogPath,
  buildCoursePath,
  buildProfessorPath,
  buildReviewPath,
  buildSearchPath,
  buildSubmitPath,
} from "@/lib/site";

describe("site URL builders", () => {
  it("builds course and catalog paths", () => {
    expect(buildCoursePath("acct1000")).toBe("/course/ACCT1000");
    expect(buildCatalogPath(["fba", "aim"])).toBe("/catalog/FBA/AIM");
    expect(buildCatalogPath(["gecourse", "gega"])).toBe("/catalog/gecourse/GEGA");
  });

  it("encodes professor path and review page suffix", () => {
    expect(buildProfessorPath("CHAN TAI/MAN")).toBe("/professor/CHAN%20TAI%2FMAN");
    expect(buildReviewPath("acct1000", "CHAN TAI/MAN")).toBe(
      "/reviews/ACCT1000/CHAN%20TAI%2FMAN",
    );
    expect(buildReviewPath("acct1000", "CHAN TAI/MAN", 3)).toBe(
      "/reviews/ACCT1000/CHAN%20TAI%2FMAN/3",
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

describe("submit path", () => {
  it("encodes a decoded professor name exactly once", () => {
    expect(buildSubmitPath("educ7180", "ZHOUHAN JIN")).toBe("/submit/EDUC7180/ZHOUHAN%20JIN");
    expect(buildSubmitPath("acct1000", "CHAN TAI/MAN")).toBe(
      "/submit/ACCT1000/CHAN%20TAI%2FMAN",
    );
  });

  it("does not double-encode an already percent-encoded name", () => {
    // 曾经的线上 bug：链接处对「已经含 %20」的片段又做了一次 encodeURIComponent，
    // 于是同一个页面出现 /submit/…%2520… 与 /submit/…%20… 两种 URL 形态。
    // 正确做法是先把片段解码成姓名，再交给构造器编码一次。
    expect(buildSubmitPath("EDUC7180", decodeURIComponent("ZHOUHAN%20JIN"))).toBe(
      "/submit/EDUC7180/ZHOUHAN%20JIN",
    );
  });

  it("keeps the review header on the shared builder", () => {
    const source = readFileSync("components/review/review-header.tsx", "utf8");
    expect(source).toContain("buildSubmitPath(");
    expect(source).not.toContain("encodeURIComponent(prof)");
  });
});
