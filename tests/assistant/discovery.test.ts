import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({ default: { from: vi.fn() } }));

import { discoverResultSchema, type DiscoverResult } from "@/lib/assistant/discovery/schema";
import {
  defaultDiscoveryDeps,
  MAX_DISCOVERY_RESULT_CHARS,
  runDiscoverCourseCandidates,
  type DiscoveryDeps,
} from "@/lib/assistant/discovery/discover";
import type { DiscoveryPool } from "@/lib/assistant/discovery/pool";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import { timetableVersion } from "@/lib/timetable/analysis";
import { McpToolError } from "@/lib/mcp/errors";
import { normalizePlanSection } from "@/lib/timetable/schema";

import { offer, pool, poolCourse, pwcRow } from "../fixtures/discovery-pool";

const TERM = { year: 2026, sem: 1 };

const gegaPlan = [
  normalizePlanSection({
    courseCode: "GEGA1000",
    prof: "CHAN",
    section: "007",
    schedules: [
      { date: "MON", time: "13:00-14:15", location: "E11" },
      { date: "THU", time: "13:00-14:15", location: "E11" },
    ],
  }),
];

const readyState = (
  planSections = gegaPlan,
  planTerm = TERM,
  overrides?: Partial<Extract<TimetableState, { status: "ready" }>>,
): TimetableState => ({
  status: "ready",
  plan: {
    name: "Plan",
    year: planTerm.year,
    sem: planTerm.sem,
    sections: planSections,
  },
  currentTerm: TERM,
  otherPlansThisTerm: 0,
  localOnly: false,
  truncated: false,
  version: timetableVersion(planSections),
  ...overrides,
});

const ciscPool = (): DiscoveryPool =>
  pool({
    courses: [poolCourse({ courseCode: "CISC1001", department: "CIS", faculty: "FST" })],
    instructorRows: [pwcRow({ pwcId: 101, courseCode: "CISC1001", instructor: "LEE" })],
    offers: [
      offer(101, "001", ["MON 13:30-14:45 E11", "THU 13:30-14:45 E11", "WED 08:30-09:45 E11"]),
    ],
  });

function scopeCisc() {
  return { scope: { codePrefix: "CISC" as const } };
}

function discoveryDeps(
  discoveryPool: DiscoveryPool,
  overrides?: Partial<DiscoveryDeps>,
): DiscoveryDeps {
  const loadPool = vi.fn(async () => discoveryPool);
  const loadReviews = vi.fn(async () => []);
  return {
    loadCatalogTerm: async () => TERM,
    loadPool,
    loadReviews,
    ...overrides,
  };
}

function assertOkDiscoverResult(result: unknown): asserts result is DiscoverResult {
  expect(discoverResultSchema.parse(result)).toBeTruthy();
  if (result !== null && typeof result === "object" && "error" in result) {
    throw new Error("unexpected failure");
  }
}

function forbiddenKeyPaths(value: unknown): string[] {
  const hits: string[] = [];
  const allowedPath = (path: string) =>
    /^candidates\[\d+\]\.reviewEvidence(\.|$)/.test(path) ||
    path === "notes" ||
    path.startsWith("notes[") ||
    path === "notApplied" ||
    path.startsWith("notApplied[");

  const walk = (node: unknown, path: string) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
      const next = path ? `${path}.${key}` : key;
      if (!allowedPath(next) && /^(midterm|exam|prereq|seat)$/i.test(key)) {
        hits.push(next);
      }
      walk(child, next);
    }
  };
  walk(value, "");
  return hits;
}

describe("runDiscoverCourseCandidates fit", () => {
  it("CISC1001 regression: confirmed_clash without noClash required", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState(),
      scopeCisc(),
      discoveryDeps(ciscPool()),
    );
    assertOkDiscoverResult(result);
    const candidate = result.candidates.find((c) => c.courseCode === "CISC1001");
    expect(candidate?.fit).toBe("confirmed_clash");
    expect(candidate?.clashes?.map((c) => c.day).sort()).toEqual(["MON", "THU"]);
    expect(candidate?.clashes?.every((c) => c.with === "GEGA1000-007")).toBe(true);
  });

  it("CISC1001 regression: excludes section when required.noClash is true", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState(),
      { ...scopeCisc(), required: { noClash: true } },
      discoveryDeps(ciscPool()),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates.some((c) => c.courseCode === "CISC1001")).toBe(false);
    expect(result.excluded.required.noClash).toBe(1);
  });

  it("boundary: end-to-start touching is verified_no_clash", async () => {
    const boundaryPool = pool({
      courses: [poolCourse({ courseCode: "ECON1001" })],
      instructorRows: [pwcRow({ pwcId: 2, courseCode: "ECON1001" })],
      offers: [offer(2, "001", ["MON 14:15-15:30 E11"])],
    });
    const result = await runDiscoverCourseCandidates(
      readyState(),
      { scope: { codePrefix: "ECON" } },
      discoveryDeps(boundaryPool),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates[0]?.fit).toBe("verified_no_clash");
  });

  it("unscheduled saved section yields incomplete fit, never verified", async () => {
    const planWithGap = [
      ...gegaPlan,
      normalizePlanSection({ courseCode: "GEND1001", prof: "LAM", section: "001", schedules: [] }),
    ];
    const clearPool = pool({
      courses: [poolCourse({ courseCode: "MATH1010" })],
      instructorRows: [pwcRow({ pwcId: 3, courseCode: "MATH1010" })],
      offers: [offer(3, "001", ["TUE 10:00-11:15 E11"])],
    });
    const result = await runDiscoverCourseCandidates(
      readyState(planWithGap),
      { scope: { codePrefix: "MATH" } },
      discoveryDeps(clearPool),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates[0]?.fit).toBe("incomplete");
    expect(result.candidates.some((c) => c.fit === "verified_no_clash")).toBe(false);
  });

  it("noClash required with incomplete plan lists clash_check_incomplete in unverified", async () => {
    const planWithGap = [
      ...gegaPlan,
      normalizePlanSection({ courseCode: "GEND1001", prof: "LAM", section: "001", schedules: [] }),
    ];
    const clearPool = pool({
      courses: [poolCourse({ courseCode: "MATH1010" })],
      instructorRows: [pwcRow({ pwcId: 3, courseCode: "MATH1010" })],
      offers: [offer(3, "001", ["TUE 10:00-11:15 E11"])],
    });
    const result = await runDiscoverCourseCandidates(
      readyState(planWithGap),
      { scope: { codePrefix: "MATH" }, required: { noClash: true } },
      discoveryDeps(clearPool),
    );
    assertOkDiscoverResult(result);
    expect(result.unverified).toContainEqual({
      courseCode: "MATH1010",
      section: "001",
      reason: "clash_check_incomplete",
    });
  });

  it("incomplete candidate meetings with required.startAfter goes to unverified", async () => {
    const satPool = pool({
      courses: [poolCourse({ courseCode: "GEST1000" })],
      instructorRows: [pwcRow({ pwcId: 4, courseCode: "GEST1000" })],
      offers: [offer(4, "001", ["MON 11:00-12:15 E11", "SAT 11:00-12:15 E11"])],
    });
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { courseType: "GE" }, required: { startAfter: "10:00" } },
      discoveryDeps(satPool),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates.some((c) => c.courseCode === "GEST1000")).toBe(false);
    expect(result.unverified).toContainEqual({
      courseCode: "GEST1000",
      section: "001",
      reason: "meeting_times_incomplete",
    });
  });

  it("no_plan sets not_checked and notApplied for noClash", async () => {
    const result = await runDiscoverCourseCandidates(
      { status: "no_plan", currentTerm: TERM },
      { ...scopeCisc(), required: { noClash: true } },
      discoveryDeps(ciscPool()),
    );
    assertOkDiscoverResult(result);
    expect(result.timetable.status).toBe("no_plan");
    expect(result.candidates.every((c) => c.fit === "not_checked")).toBe(true);
    expect(result.notApplied.some((line) => line.includes("noClash"))).toBe(true);
  });

  it("loading sets timetable.status loading", async () => {
    const result = await runDiscoverCourseCandidates(
      { status: "loading" },
      scopeCisc(),
      discoveryDeps(ciscPool()),
    );
    assertOkDiscoverResult(result);
    expect(result.timetable.status).toBe("loading");
  });

  it("plan term mismatch sets term_mismatch", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState(gegaPlan, { year: 2025, sem: 1 }),
      scopeCisc(),
      discoveryDeps(ciscPool()),
    );
    assertOkDiscoverResult(result);
    expect(result.timetable.status).toBe("term_mismatch");
    expect(result.candidates[0]?.fit).toBe("not_checked");
  });

  it("plannerVersion matches state.version when ready", async () => {
    const state = readyState();
    const result = await runDiscoverCourseCandidates(state, scopeCisc(), discoveryDeps(ciscPool()));
    assertOkDiscoverResult(result);
    expect(state.status).toBe("ready");
    if (state.status !== "ready") return;
    expect(result.timetable.plannerVersion).toBe(state.version);
  });
});

describe("runDiscoverCourseCandidates rules and ranking", () => {
  it("scenario E: required startAfter and avoidDays exclude violating sections", async () => {
    const scenarioPool = pool({
      courses: [
        poolCourse({ courseCode: "GEST1001" }),
        poolCourse({ courseCode: "GEST1002" }),
        poolCourse({ courseCode: "GEST1003" }),
      ],
      instructorRows: [
        pwcRow({ pwcId: 11, courseCode: "GEST1001" }),
        pwcRow({ pwcId: 12, courseCode: "GEST1002" }),
        pwcRow({ pwcId: 13, courseCode: "GEST1003" }),
      ],
      offers: [
        offer(11, "001", ["MON 11:00-12:15 E11"]),
        offer(12, "001", ["FRI 11:00-12:15 E11"]),
        offer(13, "001", ["MON 09:00-10:15 E11"]),
      ],
    });
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      {
        scope: { codePrefix: "GEST" },
        required: { startAfter: "10:00", avoidDays: ["FRI"] },
      },
      discoveryDeps(scenarioPool),
    );
    assertOkDiscoverResult(result);
    expect(result.excluded.required.startAfter).toBeGreaterThan(0);
    expect(result.excluded.required.avoidDays).toBeGreaterThan(0);
    for (const candidate of result.candidates) {
      for (const line of candidate.meetings) {
        expect(line.startsWith("FRI")).toBe(false);
      }
    }
  });

  it("picks best non-clashing section and lists clashing otherSections", async () => {
    const twoSectionPool = pool({
      courses: [poolCourse({ courseCode: "CISC2001" })],
      instructorRows: [pwcRow({ pwcId: 21, courseCode: "CISC2001" })],
      offers: [
        offer(21, "001", ["MON 13:30-14:45 E11", "THU 13:30-14:45 E11"]),
        offer(21, "002", ["TUE 11:00-12:15 E11"]),
      ],
    });
    const result = await runDiscoverCourseCandidates(
      readyState(),
      { scope: { codePrefix: "CISC2" } },
      discoveryDeps(twoSectionPool),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates[0]?.section).toBe("002");
    expect(result.candidates[0]?.otherSections).toContainEqual(
      expect.objectContaining({ section: "001", fit: "confirmed_clash" }),
    );
  });

  it("merges equivalent-code rows under the primary course code", async () => {
    const eqPool = pool({
      courses: [poolCourse({ courseCode: "GEST1000", aka: ["GEST1000A"] })],
      instructorRows: [
        pwcRow({ pwcId: 31, courseCode: "GEST1000" }),
        pwcRow({ pwcId: 32, courseCode: "GEST1000", instructor: "CO-TEACHER" }),
      ],
      offers: [offer(31, "001", ["MON 11:00-12:15 E11"]), offer(32, "001", ["MON 11:00-12:15 E11"])],
    });
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { courseType: "GE" } },
      discoveryDeps(eqPool),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates.filter((c) => c.courseCode === "GEST1000")).toHaveLength(1);
    expect(result.candidates[0]?.instructors.length).toBeGreaterThan(1);
  });

  it("returns one candidate per course respecting limit", async () => {
    const courses = ["GEST2001", "GEST2002", "GEST2003", "GEST2004"].map((code, index) =>
      poolCourse({ courseCode: code }),
    );
    const rows = courses.map((course, index) => pwcRow({ pwcId: 40 + index, courseCode: course.courseCode }));
    const offersList = rows.map((row) => offer(row.pwcId, "001", ["TUE 11:00-12:15 E11"]));
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { codePrefix: "GEST2" }, limit: 2 },
      discoveryDeps(pool({ courses, instructorRows: rows, offers: offersList })),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((c) => c.rank)).toEqual([1, 2]);
  });
});

describe("runDiscoverCourseCandidates exclusions and failures", () => {
  it("GEST1006-002 shows confirmed_clash after the saved plan gains an overlapping section", async () => {
    const planWithArt = [
      ...gegaPlan,
      normalizePlanSection({
        courseCode: "ART1001",
        prof: "LAM",
        section: "001",
        schedules: [{ date: "TUE", time: "11:30-12:45", location: "E11" }],
      }),
    ];
    const overlapPool = pool({
      courses: [poolCourse({ courseCode: "GEST1006", courseType: "GE" })],
      instructorRows: [pwcRow({ pwcId: 1, courseCode: "GEST1006" })],
      offers: [offer(1, "002", ["TUE 11:30-12:45 E11", "THU 11:30-12:45 E11"])],
    });
    const result = await runDiscoverCourseCandidates(
      readyState(planWithArt),
      { scope: { courseType: "GE" } },
      discoveryDeps(overlapPool),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates[0]).toMatchObject({
      courseCode: "GEST1006",
      section: "002",
      fit: "confirmed_clash",
    });
  });

  it("excludes courses already in the saved plan", async () => {
    const inPlanPool = pool({
      courses: [poolCourse({ courseCode: "GEGA1000" }), poolCourse({ courseCode: "CISC1001" })],
      instructorRows: [
        pwcRow({ pwcId: 51, courseCode: "GEGA1000" }),
        pwcRow({ pwcId: 52, courseCode: "CISC1001" }),
      ],
      offers: [
        offer(51, "008", ["MON 11:00-12:15 E11"]),
        offer(52, "001", ["TUE 11:00-12:15 E11"]),
      ],
    });
    const result = await runDiscoverCourseCandidates(
      readyState(),
      { scope: { codePrefix: "CISC" } },
      discoveryDeps(inPlanPool),
    );
    assertOkDiscoverResult(result);
    expect(result.excluded.alreadyInPlan).toBe(1);
    expect(result.candidates.every((c) => c.courseCode !== "GEGA1000")).toBe(true);
  });

  it("lists offered courses with no sections in noListedSections", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { courseType: "GE" } },
      discoveryDeps(pool({ courses: [poolCourse({ courseCode: "GEST9999" })], instructorRows: [], offers: [] })),
    );
    assertOkDiscoverResult(result);
    expect(result.noListedSections).toContain("GEST9999");
    expect(result.candidates.some((c) => c.courseCode === "GEST9999")).toBe(false);
  });

  it("returns empty candidates when every section fails required rules", async () => {
    const failPool = pool({
      courses: [poolCourse({ courseCode: "GEST3001" })],
      instructorRows: [pwcRow({ pwcId: 61, courseCode: "GEST3001" })],
      offers: [offer(61, "001", ["MON 08:00-09:15 E11"])],
    });
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { codePrefix: "GEST3" }, required: { startAfter: "10:00" } },
      discoveryDeps(failPool),
    );
    assertOkDiscoverResult(result);
    expect(result.status).toBe("ok");
    expect(result.candidates).toEqual([]);
    expect(result.examined.truncated).toBe(false);
  });

  it("surfaces pool truncation in examined.truncated", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { courseType: "GE" } },
      discoveryDeps(pool({ truncated: true, totalMatchingCourses: 400 })),
    );
    assertOkDiscoverResult(result);
    expect(result.examined.truncated).toBe(true);
  });

  it("invalid input returns invalid_request without loading the pool", async () => {
    const deps = discoveryDeps(ciscPool());
    const result = await runDiscoverCourseCandidates(readyState([]), { scope: {} }, deps);
    expect(result).toMatchObject({ error: "invalid_request" });
    expect("issues" in result && Array.isArray(result.issues) && result.issues.length > 0).toBe(true);
    expect(deps.loadPool).not.toHaveBeenCalled();
  });

  it("loadPool failure returns temporarily_unavailable", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { courseType: "GE" } },
      discoveryDeps(ciscPool(), {
        loadPool: async () => {
          throw new McpToolError("temporarily_unavailable");
        },
      }),
    );
    expect(result).toEqual({ error: "temporarily_unavailable" });
  });
});

describe("runDiscoverCourseCandidates reviews and output", () => {
  it("enriches top candidates with review evidence", async () => {
    const reviewPool = pool({
      courses: ["GEST4001", "GEST4002", "GEST4003", "GEST4004"].map((code) => poolCourse({ courseCode: code })),
      instructorRows: ["GEST4001", "GEST4002", "GEST4003", "GEST4004"].map((code, index) =>
        pwcRow({ pwcId: 70 + index, courseCode: code, reviews: 10 }),
      ),
      offers: ["GEST4001", "GEST4002", "GEST4003", "GEST4004"].map((code, index) =>
        offer(70 + index, "001", ["TUE 11:00-12:15 E11"]),
      ),
    });
    const loadReviews = vi.fn(async (ids: number[]) =>
      ids.map((pwcId) => ({
        pwcId,
        texts: [`The midterm was fair for section ${pwcId}`],
      })),
    );
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { codePrefix: "GEST4" }, reviewTerms: ["midterm"], limit: 4 },
      discoveryDeps(reviewPool, { loadReviews }),
    );
    assertOkDiscoverResult(result);
    expect(loadReviews).toHaveBeenCalledTimes(1);
    expect(loadReviews.mock.calls[0]?.[0]?.length).toBeLessThanOrEqual(6);
    const enriched = result.candidates.slice(0, 3);
    expect(enriched.every((c) => c.reviewEvidence?.mentions.midterm !== undefined)).toBe(true);
    for (const candidate of enriched) {
      for (const excerpt of candidate.reviewEvidence?.excerpts ?? []) {
        expect([...excerpt].length).toBeLessThanOrEqual(120);
      }
    }
  });

  it("continues without reviewEvidence when loadReviews fails", async () => {
    const reviewPool = pool({
      courses: [poolCourse({ courseCode: "GEST5001" })],
      instructorRows: [pwcRow({ pwcId: 80, courseCode: "GEST5001", reviews: 5 })],
      offers: [offer(80, "001", ["TUE 11:00-12:15 E11"])],
    });
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { codePrefix: "GEST5" }, reviewTerms: ["midterm"] },
      discoveryDeps(reviewPool, {
        loadReviews: async () => {
          throw new McpToolError("temporarily_unavailable");
        },
      }),
    );
    assertOkDiscoverResult(result);
    expect(result.candidates[0]?.reviewEvidence).toBeUndefined();
    expect(result.notApplied).toContain("reviewTerms: reviews could not be read");
  });

  it("does not expose forbidden key names outside allowed paths", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { codePrefix: "GEST5" }, reviewTerms: ["midterm"] },
      discoveryDeps(
        pool({
          courses: [poolCourse({ courseCode: "GEST5001" })],
          instructorRows: [pwcRow({ pwcId: 81, courseCode: "GEST5001", reviews: 2 })],
          offers: [offer(81, "001", ["TUE 11:00-12:15 E11"])],
        }),
        {
          loadReviews: async () => [{ pwcId: 81, texts: ["midterm exam mentioned"] }],
        },
      ),
    );
    assertOkDiscoverResult(result);
    const hits = forbiddenKeyPaths(result);
    expect(hits).toEqual([]);
  });

  it("reports mutual clashes among returned best sections", async () => {
    const clashPool = pool({
      courses: [poolCourse({ courseCode: "GEST6001" }), poolCourse({ courseCode: "GEST6002" })],
      instructorRows: [
        pwcRow({ pwcId: 91, courseCode: "GEST6001" }),
        pwcRow({ pwcId: 92, courseCode: "GEST6002" }),
      ],
      offers: [
        offer(91, "001", ["MON 11:00-12:15 E11"]),
        offer(92, "001", ["MON 11:00-12:15 E22"]),
      ],
    });
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { codePrefix: "GEST6" }, limit: 2 },
      discoveryDeps(clashPool),
    );
    assertOkDiscoverResult(result);
    expect(result.mutualClashes.length).toBeGreaterThan(0);
    const pair = result.mutualClashes[0]!;
    expect(pair.sort()).toEqual(["GEST6001-001", "GEST6002-001"].sort());
  });

  it("uses fixed notes and ranking policy string", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      { scope: { courseType: "GE" } },
      discoveryDeps(pool({ courses: [poolCourse()] })),
    );
    assertOkDiscoverResult(result);
    expect(result.notes).toEqual([
      "required.noClash checks each returned section against the saved plan separately; two individually compatible sections can still clash—use preview_timetable for a combined check.",
      "mutualClashes lists overlaps among the returned best sections only; it is not proof they all fit together.",
      "Ratings are past students' reports for this instructor's offering of the course.",
      "The site has no official exam format, prerequisite, seat or workload data.",
      "suggestedYear is a catalog hint only; it is not official registration eligibility.",
      "When examined.truncated is true, the search covered a bounded slice of matching courses—not every match was evaluated.",
    ]);
    expect(result.ranking.length).toBeGreaterThan(10);
  });
});

describe("oversized discovery compaction", () => {
  function buildOversizedPool(): DiscoveryPool {
    const courses = Array.from({ length: 8 }, (_, index) =>
      poolCourse({
        courseCode: `BIG${1000 + index}`,
        titleEn: `Oversized discovery course ${index} `.repeat(20),
        titleZh: `超長標題${index}`.repeat(10),
        topicBody: "Macao history and workload detail ".repeat(120),
      }),
    );
    const instructorRows = courses.flatMap((course, index) => [
      pwcRow({ pwcId: 9000 + index * 2, courseCode: course.courseCode, reviews: 40 }),
      pwcRow({ pwcId: 9000 + index * 2 + 1, courseCode: course.courseCode, reviews: 5 }),
    ]);
    const offers = courses.flatMap((course, index) => [
      offer(9000 + index * 2, "001", [
        "MON 10:00-11:15 E11",
        "WED 10:00-11:15 E11",
        "FRI 10:00-11:15 E11",
      ]),
      offer(9000 + index * 2, "002", ["TUE 14:00-15:15 E11", "THU 14:00-15:15 E11"]),
    ]);
    return pool({ courses, instructorRows, offers });
  }

  it("shrinks oversized payloads while keeping safety fields and honest fit claims", async () => {
    const result = await runDiscoverCourseCandidates(
      readyState([]),
      {
        scope: { codePrefix: "BIG" },
        reviewTerms: ["midterm", "workload"],
        limit: 8,
      },
      discoveryDeps(buildOversizedPool(), {
        loadReviews: async (ids) =>
          ids.map((pwcId) => ({
            pwcId,
            texts: [`Review ${pwcId} mentions midterm workload repeatedly. `.repeat(30)],
          })),
      }),
    );
    assertOkDiscoverResult(result);
    const serialized = JSON.stringify(result);
    expect(serialized.length).toBeLessThanOrEqual(MAX_DISCOVERY_RESULT_CHARS);
    expect(result.compaction?.truncated).toBe(true);
    expect(result.compaction?.dropped.length).toBeGreaterThan(0);
    expect(result.mutualClashes).toBeDefined();
    expect(result.timetable).toBeDefined();
    expect(result.notes.some((note) => note.startsWith("required.noClash"))).toBe(true);
    expect(result.notes.some((note) => note.startsWith("mutualClashes"))).toBe(true);
    expect(result.notes.some((note) => note.startsWith("The site has no official"))).toBe(true);
    expect(result.notes.some((note) => note.startsWith("suggestedYear"))).toBe(true);
    if (result.compaction?.downgraded) {
      expect(result.candidates.every((candidate) => candidate.fit !== "verified_no_clash")).toBe(true);
    }
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

describe("discovery contract", () => {
  it("exports MAX_DISCOVERY_RESULT_CHARS and defaultDiscoveryDeps", () => {
    expect(MAX_DISCOVERY_RESULT_CHARS).toBe(12_000);
    expect(defaultDiscoveryDeps.loadCatalogTerm).toBeDefined();
    expect(defaultDiscoveryDeps.loadPool).toBeDefined();
    expect(defaultDiscoveryDeps.loadReviews).toBeDefined();
  });
});
