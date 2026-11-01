import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { DiscoverResult } from "@/lib/assistant/discovery/schema";
import type { TimetableState } from "@/lib/assistant/timetable-context";
import { timetableVersion } from "@/lib/timetable/analysis";
import { normalizePlanSection } from "@/lib/timetable/schema";

vi.mock("server-only", () => ({}));

const REQUIRED_ENV = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY"] as const;

function readLocalEnv(names: readonly string[]): Record<string, string> {
  const file = path.join(process.cwd(), ".env.local");
  if (!existsSync(file)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match && names.includes(match[1])) {
      values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  return values;
}

for (const [name, value] of Object.entries(readLocalEnv(REQUIRED_ENV))) {
  if (value) process.env[name] = value;
}

const enabled = process.env.DISCOVERY_REAL_DATA === "1";
const hasCredentials = REQUIRED_ENV.every((name) => Boolean(process.env[name]?.trim()));
const label = process.env.DISCOVERY_REAL_DATA_LABEL ?? "smoke";

type Scenario = {
  id: string;
  buildState: (term: { year: number; sem: number }) => TimetableState;
  args: Record<string, unknown>;
  maxRequests: number;
};

const gegaPlanSections = [
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

function readyState(
  term: { year: number; sem: number },
  sections: ReturnType<typeof normalizePlanSection>[] = [],
): TimetableState {
  return {
    status: "ready",
    plan: { name: "Real-data smoke", year: term.year, sem: term.sem, sections },
    currentTerm: term,
    otherPlansThisTerm: 0,
    localOnly: false,
    truncated: false,
    version: timetableVersion(sections),
  };
}

const SCENARIOS: Scenario[] = [
  {
    id: "gest-easy",
    buildState: readyState,
    args: {
      scope: { codePrefix: "GEST" },
      preferred: { startAfter: "12:00" },
      priorities: ["easier"],
      limit: 8,
    },
    maxRequests: 3,
  },
  {
    id: "ge-topics-macao-history",
    buildState: readyState,
    args: {
      scope: {
        courseType: "GE",
        topics: ["Macao", "Macau", "Chinese history", "history"],
      },
      limit: 8,
    },
    maxRequests: 3,
  },
  {
    id: "cisc-first-year",
    buildState: readyState,
    args: {
      scope: { codePrefix: "CISC", maxSuggestedYear: 1 },
      limit: 8,
    },
    maxRequests: 3,
  },
  {
    id: "cis-dept-3-credits",
    buildState: readyState,
    args: {
      scope: { department: "CIS", credits: 3 },
      limit: 8,
    },
    maxRequests: 3,
  },
  {
    id: "ge-required-schedule",
    buildState: (term) => readyState(term, gegaPlanSections),
    args: {
      scope: { courseType: "GE" },
      required: { startAfter: "10:00", avoidDays: ["FRI"] },
      limit: 8,
    },
    // Full GE pools can chunk offer reads once on real data.
    maxRequests: 4,
  },
  {
    id: "non-ge-truncation",
    buildState: readyState,
    args: {
      scope: { courseType: "Non-GE" },
      limit: 8,
    },
    // Wide Non-GE pools chunk pwc/offer reads on real data; keep the reviewTerms ceiling.
    maxRequests: 9,
  },
];

function supabaseFetchCounter(supabaseUrl: string) {
  const base = supabaseUrl.replace(/\/$/, "");
  const original = globalThis.fetch.bind(globalThis);
  let count = 0;

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.startsWith(base)) count += 1;
    return original(input, init);
  }) as typeof fetch;

  return {
    get requests() {
      return count;
    },
    restore() {
      globalThis.fetch = original;
    },
  };
}

function assertDiscoverResult(result: unknown): asserts result is DiscoverResult {
  expect(result).toBeTruthy();
  expect(result).not.toMatchObject({ error: expect.anything() });
}

function candidateSections(result: DiscoverResult): Array<{ courseCode: string; section: string }> {
  const pairs: Array<{ courseCode: string; section: string }> = [];
  for (const candidate of result.candidates) {
    pairs.push({ courseCode: candidate.courseCode, section: candidate.section });
    for (const other of candidate.otherSections) {
      pairs.push({ courseCode: candidate.courseCode, section: other.section });
    }
  }
  return pairs;
}

describe.skipIf(!enabled)("assistant discovery real-data performance smoke", () => {
  it.skipIf(!hasCredentials)("reports DB cost for six representative scopes", async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
    const { readAppConfig } = await import("@/lib/config/app-config-core");
    const supabase = (await import("@/lib/supabase/server")).default;
    const { runDiscoverCourseCandidates, MAX_DISCOVERY_RESULT_CHARS } = await import(
      "@/lib/assistant/discovery/discover"
    );
    const discoveryData = await import("@/lib/assistant/data/discovery");

    const appConfig = await readAppConfig(supabase);
    const term = { year: appConfig.currentYear, sem: appConfig.currentSem };

    const deps = {
      loadCatalogTerm: async () => term,
      loadPool: discoveryData.loadDiscoveryPool,
      loadReviews: discoveryData.loadReviewTexts,
    };

    const runs: Array<{
      id: string;
      requests: number;
      ms: number;
      chars: number;
      examined: DiscoverResult["examined"];
      candidates: Array<{ courseCode: string; section: string }>;
      truncated: boolean;
      error?: string;
    }> = [];

    for (const scenario of SCENARIOS) {
      const counter = supabaseFetchCounter(supabaseUrl);
      const started = performance.now();
      let result: DiscoverResult | { error: string };
      try {
        result = await runDiscoverCourseCandidates(
          scenario.buildState(term),
          scenario.args,
          deps,
        );
      } finally {
        counter.restore();
      }
      const ms = performance.now() - started;
      const requests = counter.requests;

      if ("error" in result) {
        expect(result, `${scenario.id} returned ${result.error}`).not.toHaveProperty("error");
      }

      assertDiscoverResult(result);
      const serialized = JSON.stringify(result);
      const sections = candidateSections(result);

      expect(
        requests,
        `${scenario.id} exceeded ${scenario.maxRequests} Supabase requests`,
      ).toBeLessThanOrEqual(scenario.maxRequests);
      expect(serialized.length).toBeLessThanOrEqual(MAX_DISCOVERY_RESULT_CHARS);

      await verifySectionsExistInOffer(supabase, term, sections);

      runs.push({
        id: scenario.id,
        requests,
        ms,
        chars: serialized.length,
        examined: result.examined,
        candidates: sections,
        truncated: result.examined.truncated,
      });
    }

    const file = path.join(".eval-results", "assistant", `discovery-real-data-${label}.json`);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(
      file,
      JSON.stringify(
        {
          kind: "discovery-real-data" as const,
          label,
          term,
          scenarios: runs,
        },
        null,
        2,
      ),
    );
    console.info(JSON.stringify({ file, scenarios: runs.map((entry) => entry.id) }, null, 2));

    expect(runs.length).toBe(SCENARIOS.length);
  }, 120_000);
});

async function verifySectionsExistInOffer(
  supabase: { from: (table: string) => unknown },
  term: { year: number; sem: number },
  pairs: Array<{ courseCode: string; section: string }>,
) {
  if (pairs.length === 0) return;

  const codes = [...new Set(pairs.map((pair) => pair.courseCode))];
  const pwcBuilder = await (supabase.from("prof_with_course") as {
    select: (columns: string) => {
      in: (column: string, values: string[]) => Promise<{ data: unknown; error: unknown }>;
    };
  })
    .select("id,course_id")
    .in("course_id", codes);

  expect(pwcBuilder.error, "prof_with_course read failed").toBeNull();

  const pwcRows = Array.isArray(pwcBuilder.data) ? pwcBuilder.data : [];
  const codeByPwcId = new Map<number, string>();
  for (const row of pwcRows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const id = Number(record.id);
    const courseId = String(record.course_id ?? "").toUpperCase();
    if (Number.isFinite(id) && id > 0 && courseId) {
      codeByPwcId.set(id, courseId);
    }
  }

  const pwcIds = [...codeByPwcId.keys()];
  expect(pwcIds.length).toBeGreaterThan(0);

  const offerBuilder = await (supabase.from("offer") as {
    select: (columns: string) => {
      eq: (column: string, value: number | string) => {
        eq: (column: string, value: number | string) => {
          in: (column: string, values: number[]) => Promise<{ data: unknown; error: unknown }>;
        };
      };
    };
  })
    .select("course_id,section")
    .eq("year", term.year)
    .eq("sem", term.sem)
    .in("course_id", pwcIds);

  expect(offerBuilder.error, "offer read failed").toBeNull();

  const valid = new Set<string>();
  for (const row of Array.isArray(offerBuilder.data) ? offerBuilder.data : []) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    const pwcId = Number(record.course_id);
    const section = String(record.section ?? "").trim();
    const courseCode = codeByPwcId.get(pwcId);
    if (courseCode && section) valid.add(`${courseCode}:${section}`);
  }

  for (const pair of pairs) {
    expect(
      valid.has(`${pair.courseCode}:${pair.section}`),
      `invented section ${pair.courseCode}-${pair.section}`,
    ).toBe(true);
  }
}
