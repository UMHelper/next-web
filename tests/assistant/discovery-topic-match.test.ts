import { describe, expect, it } from "vitest";

import {
  buildTopicSearchTerms,
  filterCoursesByTopicMatch,
  matchTopic,
  MAX_TOPIC_TERMS,
  topicVariants,
} from "@/lib/assistant/discovery/topic-match";
import { topicScore } from "@/lib/assistant/discovery/rank";
import { filterFixturePool } from "@/evals/assistant/discovery-fixture";
import { poolCourse } from "../fixtures/discovery-pool";

const gega1000 = poolCourse({
  courseCode: "GEGA1000",
  titleEn: "Macao and Chinese History",
  topicBody: "Macao history and Chinese cultural heritage.",
});

const gega1002 = poolCourse({
  courseCode: "GEGA1002",
  titleEn: "Modern China",
  topicBody: "Twentieth-century Chinese history.",
});

const chineseCivilization = poolCourse({
  courseCode: "GEGA1001",
  titleEn: "Chinese Civilization",
  topicBody: "Survey of Chinese history and culture.",
});

describe("topicVariants", () => {
  it("normalizes Macau and Macao spellings", () => {
    expect(topicVariants("Macau history")).toContain("macao history");
    expect(topicVariants("Macao history")).toContain("macau history");
  });
});

describe("matchTopic tiers", () => {
  it("matches Macao history as tier 1 on GEGA1000", () => {
    const result = matchTopic(gega1000, ["Macao history"]);
    expect(result.tier).toBe(1);
    expect(result.score).toBe(0.5);
  });

  it("matches Macau history via spelling variant as tier 1", () => {
    const result = matchTopic(gega1000, ["Macau history"]);
    expect(result.tier).toBe(1);
  });

  it("matches a contiguous multi-word phrase as tier 1 in the body", () => {
    const result = matchTopic(gega1000, ["Chinese cultural heritage"]);
    expect(result.tier).toBe(1);
  });

  it("ranks Macao history phrase hits above courses that only share a generic keyword", () => {
    expect(topicScore(gega1000, ["Macao history"])).toBeGreaterThan(
      topicScore(chineseCivilization, ["Macao history"]),
    );
    expect(topicScore(gega1000, ["Chinese history"])).toBeGreaterThan(
      topicScore(chineseCivilization, ["Chinese history"]),
    );
  });

  it("matches reordered topic words as tier 2", () => {
    const result = matchTopic(gega1000, ["heritage Chinese Macao"]);
    expect(result.tier).toBe(2);
  });

  it("does not treat AI as a substring of daily", () => {
    const course = poolCourse({
      topicTitle: "Daily life in medieval Europe",
      topicBody: "",
    });
    expect(topicScore(course, ["AI"])).toBe(0);
  });

  it("matches CJK topics on Chinese titles", () => {
    const course = poolCourse({
      titleZh: "中國歷史與文化",
      titleEn: "",
      topicBody: "",
    });
    const result = matchTopic(course, ["中國歷史"]);
    expect(result.tier).toBe(1);
  });
});

describe("filterCoursesByTopicMatch", () => {
  it("admits tier-3 fallback when fewer than three tier-1/2 courses match", () => {
    const courses = [
      gega1000,
      poolCourse({ courseCode: "MISC0001", titleEn: "Intro to Macao", topicBody: "" }),
    ];
    const filtered = filterCoursesByTopicMatch(courses, ["Macao history"]);
    expect(filtered.courses.map((course) => course.courseCode)).toContain("GEGA1000");
    expect(filtered.topicFallback).toBe(true);
    expect(filtered.topicTier).toBe(3);
  });

  it("caps SQL prefilter terms", () => {
    const terms = buildTopicSearchTerms([
      "Macau history",
      "Chinese cultural heritage",
      "Macao culture",
      "extra topic phrase",
    ]);
    expect(terms.length).toBeLessThanOrEqual(MAX_TOPIC_TERMS);
  });
});

describe("fixture topic retrieval", () => {
  it("returns GEGA1000 for holdout-style Macau topic args", () => {
    const pool = filterFixturePool({
      codePrefix: undefined,
      courseType: "GE",
      topics: ["Macau history", "Chinese heritage", "Macao culture"],
    });
    expect(pool.courses.some((course) => course.courseCode === "GEGA1000")).toBe(true);
  });

  it("treats a credit target as a scope anchor on its own", () => {
    const pool = filterFixturePool({ codePrefix: undefined, credits: 3 });
    expect(pool.totalMatchingCourses).toBeGreaterThan(0);
    expect(pool.courses.every((course) => course.credits === "3")).toBe(true);
  });
});
