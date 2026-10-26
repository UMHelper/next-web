import { describe, expect, it } from "vitest";

import { evaluateTimeRules } from "@/lib/assistant/discovery/constraints";
import type { SectionCandidate } from "@/lib/assistant/discovery/sections";
import {
  compareRanked,
  rankingWeights,
  scoreSection,
  shrunkSignal,
  topicScore,
} from "@/lib/assistant/discovery/rank";
import { normalizePlanSection } from "@/lib/timetable/schema";

import { poolCourse, pwcRow } from "../fixtures/discovery-pool";

function sectionCandidate(
  partial: Partial<SectionCandidate> & Pick<SectionCandidate, "courseCode" | "section">,
): SectionCandidate {
  const courseCode = partial.courseCode;
  const section = partial.section;
  const instructors = partial.instructors ?? [
    pwcRow({ pwcId: 1, courseCode, reviews: 10, difficulty: 3, grade: 3, result: 3, reward: 3 }),
  ];
  const meetings = partial.meetings ?? [{ day: "MON" as const, start: "10:00", end: "11:15" }];
  return {
    label: `${courseCode}-${section}`,
    meetingLines: partial.meetingLines ?? ["MON 10:00-11:15"],
    meetingsComplete: partial.meetingsComplete ?? true,
    planSection: normalizePlanSection({
      courseCode,
      prof: "INST",
      section,
      schedules: [{ date: "MON", time: "10:00-11:15" }],
    }),
    instructors,
    meetings,
    ...partial,
    courseCode,
    section,
  };
}

describe("shrunkSignal shrinkage", () => {
  it("shrinks a high rating with very few reviews toward the neutral prior", () => {
    const signal = shrunkSignal(
      [pwcRow({ pwcId: 1, reviews: 1, difficulty: 5 })],
      "difficulty",
    );
    expect(signal.adjusted).toBeCloseTo(3.33, 2);
  });

  it("barely moves a well-reviewed rating from the raw mean", () => {
    const signal = shrunkSignal(
      [pwcRow({ pwcId: 1, reviews: 100, difficulty: 4 })],
      "difficulty",
    );
    expect(signal.adjusted).toBeCloseTo(3.95, 2);
  });

  it("weights co-taught instructor rows by review count", () => {
    const signal = shrunkSignal(
      [
        pwcRow({ pwcId: 1, reviews: 10, difficulty: 4 }),
        pwcRow({ pwcId: 2, reviews: 30, difficulty: 2 }),
      ],
      "difficulty",
    );
    expect(signal.mean).toBeCloseTo(2.5, 5);
  });
});

describe("scoreSection rating confidence", () => {
  const weightsEasier = rankingWeights({
    priorities: ["easier"],
    hasPreferred: false,
    hasTopics: false,
  });

  it("ranks a well-reviewed section above a single-review outlier under easier", () => {
    const highConfidence = scoreSection({
      section: sectionCandidate({
        courseCode: "GEST1000",
        section: "001",
        instructors: [pwcRow({ pwcId: 1, reviews: 100, difficulty: 4 })],
      }),
      preferred: [],
      topicScore: 0,
      fit: "verified_no_clash",
      clashWith: [],
      weights: weightsEasier,
    });
    const lowConfidence = scoreSection({
      section: sectionCandidate({
        courseCode: "GEST1000",
        section: "002",
        instructors: [pwcRow({ pwcId: 2, reviews: 1, difficulty: 5 })],
      }),
      preferred: [],
      topicScore: 0,
      fit: "verified_no_clash",
      clashWith: [],
      weights: weightsEasier,
    });
    expect(highConfidence.score).toBeGreaterThan(lowConfidence.score);
  });

  it("scores an easier section higher than a harder one under easier", () => {
    const easier = scoreSection({
      section: sectionCandidate({
        courseCode: "ECON1001",
        section: "001",
        instructors: [pwcRow({ pwcId: 1, reviews: 20, difficulty: 4.5 })],
      }),
      preferred: [],
      topicScore: 0,
      fit: "verified_no_clash",
      clashWith: [],
      weights: weightsEasier,
    });
    const harder = scoreSection({
      section: sectionCandidate({
        courseCode: "ECON1001",
        section: "002",
        instructors: [pwcRow({ pwcId: 2, reviews: 20, difficulty: 1.5 })],
      }),
      preferred: [],
      topicScore: 0,
      fit: "verified_no_clash",
      clashWith: [],
      weights: weightsEasier,
    });
    expect(easier.score).toBeGreaterThan(harder.score);
  });

  it("uses neutral adjusted signal and no-reviews tradeoff without reviews", () => {
    const scored = scoreSection({
      section: sectionCandidate({
        courseCode: "MATH1010",
        section: "001",
        instructors: [pwcRow({ pwcId: 1, reviews: 0, difficulty: 0, grade: 0, result: 0, reward: null })],
      }),
      preferred: [],
      topicScore: 0,
      fit: "verified_no_clash",
      clashWith: [],
      weights: weightsEasier,
    });
    expect(scored.signals.ease?.adjusted).toBe(3);
    expect(scored.tradeoffs).toContain("no reviews");
  });

  it("flags a small review sample in tradeoffs", () => {
    const scored = scoreSection({
      section: sectionCandidate({
        courseCode: "CISC2001",
        section: "001",
        instructors: [pwcRow({ pwcId: 1, reviews: 2, difficulty: 4 })],
      }),
      preferred: [],
      topicScore: 0,
      fit: "verified_no_clash",
      clashWith: [],
      weights: weightsEasier,
    });
    expect(scored.tradeoffs).toContain("only 2 reviews");
  });
});

describe("rankingWeights", () => {
  it("normalizes priority and schedule weights", () => {
    const weights = rankingWeights({
      priorities: ["easier", "higher_grades"],
      hasPreferred: true,
      hasTopics: false,
    });
    expect(weights.map((entry) => entry.key)).toEqual(["easier", "higher_grades", "schedule"]);
    expect(weights.map((entry) => entry.weight)).toEqual([
      expect.closeTo(0.4, 5),
      expect.closeTo(0.25, 5),
      expect.closeTo(0.35, 5),
    ]);
    expect(weights.reduce((sum, entry) => sum + entry.weight, 0)).toBeCloseTo(1, 5);
  });

  it("defaults to better_rated when no priorities are given", () => {
    expect(
      rankingWeights({ priorities: [], hasPreferred: false, hasTopics: false }),
    ).toEqual([{ key: "better_rated", weight: 1 }]);
  });
});

describe("scoreSection scenario F — schedule vs easier", () => {
  it("prefers meeting a late start over a slightly easier early section", () => {
    const weights = rankingWeights({
      priorities: ["easier"],
      hasPreferred: true,
      hasTopics: false,
    });
    const preferredRules = { startAfter: "12:00" as const };
    const earlyMorning = sectionCandidate({
      courseCode: "GEST1000",
      section: "001",
      instructors: [pwcRow({ pwcId: 1, reviews: 40, difficulty: 4.8 })],
      meetings: [{ day: "MON", start: "08:30", end: "09:45" }],
      meetingLines: ["MON 08:30-09:45"],
    });
    const afternoon = sectionCandidate({
      courseCode: "GEST1000",
      section: "002",
      instructors: [pwcRow({ pwcId: 2, reviews: 40, difficulty: 4 })],
      meetings: [{ day: "MON", start: "14:30", end: "15:45" }],
      meetingLines: ["MON 14:30-15:45"],
    });
    const earlyPreferred = evaluateTimeRules(
      earlyMorning.meetings,
      earlyMorning.meetingsComplete,
      preferredRules,
    );
    const afternoonPreferred = evaluateTimeRules(
      afternoon.meetings,
      afternoon.meetingsComplete,
      preferredRules,
    );
    const earlyScore = scoreSection({
      section: earlyMorning,
      preferred: earlyPreferred,
      topicScore: 0,
      fit: "verified_no_clash",
      clashWith: [],
      weights,
    });
    const afternoonScore = scoreSection({
      section: afternoon,
      preferred: afternoonPreferred,
      topicScore: 0,
      fit: "verified_no_clash",
      clashWith: [],
      weights,
    });
    expect(afternoonScore.score).toBeGreaterThan(earlyScore.score);
    expect(earlyScore.tradeoffs.some((line) => /12:00|start/i.test(line))).toBe(true);
  });
});

describe("scoreSection fit penalties", () => {
  const baseInput = {
    section: sectionCandidate({ courseCode: "GEGA1000", section: "001" }),
    preferred: [],
    topicScore: 0,
    weights: rankingWeights({ priorities: [], hasPreferred: false, hasTopics: false }),
  };

  it("halves the score on confirmed clash", () => {
    const clean = scoreSection({ ...baseInput, fit: "verified_no_clash", clashWith: [] });
    const clash = scoreSection({
      ...baseInput,
      fit: "confirmed_clash",
      clashWith: ["GEGA1000-007"],
    });
    expect(clash.score).toBe(Math.round(clean.score * 0.5));
    expect(clash.tradeoffs).toContain("clashes with GEGA1000-007");
  });

  it("reduces the score on incomplete clash check", () => {
    const clean = scoreSection({ ...baseInput, fit: "verified_no_clash", clashWith: [] });
    const incomplete = scoreSection({ ...baseInput, fit: "incomplete", clashWith: [] });
    expect(incomplete.score).toBe(Math.round(clean.score * 0.9));
  });
});

describe("topicScore", () => {
  it("scores title matches across topics", () => {
    const course = poolCourse({
      topicTitle: "History of Macao",
      topicBody: "",
    });
    expect(topicScore(course, ["Macao", "history"])).toBe(1);
  });

  it("scores partial body-only matches", () => {
    const course = poolCourse({
      topicTitle: "",
      topicBody: "Colonial history in the region",
    });
    expect(topicScore(course, ["Macao", "history"])).toBe(0.25);
  });

  it("does not match unrelated substrings for short topics like AI", () => {
    const course = poolCourse({
      topicTitle: "Daily life in medieval Europe",
      topicBody: "",
    });
    expect(topicScore(course, ["AI"])).toBe(0);
  });
});

describe("schedule preference unknowns", () => {
  it("does not treat unknown meeting data as a fully satisfied soft preference", () => {
    const section = sectionCandidate({
      courseCode: "GEST1006",
      section: "001",
      meetingsComplete: false,
      meetingLines: [],
      meetings: [],
    });
    const preferred = evaluateTimeRules([], false, { startAfter: "10:00" });
    const scored = scoreSection({
      section,
      preferred,
      topicScore: 0,
      fit: "incomplete",
      clashWith: [],
      weights: rankingWeights({ priorities: ["better_rated"], hasPreferred: true, hasTopics: false }),
    });
    expect(scored.tradeoffs.some((entry) => entry.includes("could not verify"))).toBe(true);
    expect(scored.score).toBeLessThan(100);
  });
});

describe("compareRanked tie-break", () => {
  it("sorts deterministically by score, reviews, code, and section", () => {
    const shuffled = [
      { score: 80, reviews: 5, courseCode: "BISC1000", section: "002" },
      { score: 80, reviews: 10, courseCode: "ACCT1000", section: "001" },
      { score: 80, reviews: 10, courseCode: "ACCT1000", section: "002" },
      { score: 90, reviews: 1, courseCode: "ZZZZ9999", section: "001" },
      { score: 80, reviews: 10, courseCode: "ACCT1000", section: "001" },
    ];
    const sortedOnce = [...shuffled].sort(compareRanked);
    const sortedTwice = [...shuffled].sort(compareRanked);
    expect(sortedOnce).toEqual(sortedTwice);
    expect(sortedOnce[0]?.courseCode).toBe("ZZZZ9999");
    expect(sortedOnce.filter((row) => row.score === 80).map((row) => row.section)).toEqual([
      "001",
      "001",
      "002",
      "002",
    ]);
  });
});
