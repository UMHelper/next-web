import type { DiscoveryEvalCase } from "./discovery-cases";
import { DEFAULT_DISCOVERY_TIMETABLE, GEGA_PLAN, timetablePayload } from "./discovery-fixture";

// Independently written after shadow-v1 had been observed, then frozen before
// this set's first live run. Replication evidence only; it never replaces the
// release gate.

const firstYearGeScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  if (typeof scope !== "object" || scope === null) return false;
  const typed = scope as { courseType?: string; maxSuggestedYear?: number };
  return typed.courseType === "GE" && typed.maxSuggestedYear === 1;
};

const cisIntroScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  if (typeof scope !== "object" || scope === null) return false;
  const typed = scope as { department?: string; codePrefix?: string; maxSuggestedYear?: number };
  return (
    (typed.department === "CIS" || typed.codePrefix === "CISC") &&
    typed.maxSuggestedYear === 1
  );
};

const creditScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { credits?: number }).credits === 3;
};

const gestScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { codePrefix?: string }).codePrefix === "GEST";
};

export const SHADOW_CASES_V2: DiscoveryEvalCase[] = [
  {
    id: "shadow2-first_year_ge_listing",
    pathname: "/",
    why: "A catalog listing of first-year GE options; browsing is a complete answer and discovery is not required.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Which first-year general education courses are listed for this term?",
        expect: {
          discovery: "optional",
          mention: [/GEST100|GEGA100|GESB101/],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow2-cis_intro_advice",
    pathname: "/",
    why: "A new major asking what to take: personalized recommendation, not a catalog listing.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I'm new to the CIS major—what intro computing courses make sense for my first year?",
        expect: {
          discovery: "required",
          args: cisIntroScope,
          mention: [/CISC100[12]/i],
          maxToolCalls: 4,
        },
      },
    ],
  },
  {
    id: "shadow2-credit_short_en",
    pathname: "/",
    why: "An English credit target is actionable without a department or degree direction.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I'm three credits short of my target; which 3-credit courses do you suggest?",
        expect: {
          discovery: "required",
          args: creditScope,
          mention: [/credit|3|three/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow2-credit_short_zh_hans",
    pathname: "/",
    why: "The same credit-only action in Simplified Chinese.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "我还差三个学分，能推荐几门三学分的课吗？",
        expect: {
          discovery: "required",
          args: creditScope,
          mention: [/学分|學分|credit/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow2-credit_short_zh_hant",
    pathname: "/",
    why: "The same credit-only action in Traditional Chinese.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "我仲差三個學分，推介幾科三學分嘅課程俾我。",
        expect: {
          discovery: "required",
          args: creditScope,
          mention: [/學分|credit/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow2-factual_course",
    pathname: "/",
    why: "A fact about a named course needs a course lookup, not personalized discovery.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Which faculty teaches CISC1001, and how many credits is it?",
        expect: {
          discovery: "forbidden",
          mention: [/CISC1001/i, /3|three/],
          maxToolCalls: 2,
        },
      },
    ],
  },
  {
    id: "shadow2-combined_sections",
    pathname: "/",
    why: "Two selected sections ask for a joint check; individual fits cannot prove they fit together.",
    timetable: timetablePayload(GEGA_PLAN),
    turns: [
      {
        message:
          "If I add both GEST1006 section 002 and GEST1005 section 001, would they clash with each other or with my saved plan?",
        expect: {
          discovery: "forbidden",
          mention: [/GEST1006/i, /002/],
          forbid: [/fit together|compatible with each other|互相兼容|彼此兼容/i],
          maxToolCalls: 4,
        },
      },
    ],
  },
  {
    id: "shadow2-workload_reviews",
    pathname: "/",
    why: "A review-led recommendation must surface whatever review evidence exists and admit when it is unreadable.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Which GEST course has the lightest workload according to reviews?",
        expect: {
          discovery: "required",
          args: gestScope,
          mention: [/work ?load|review/i],
          maxToolCalls: 4,
        },
      },
    ],
  },
];

type FrozenShadowTurn = { message: string; discovery: "required" | "optional" | "forbidden" };

export const FROZEN_SHADOW_V2: Array<{ id: string; turns: FrozenShadowTurn[] }> = SHADOW_CASES_V2.map(
  (evalCase) => ({
    id: evalCase.id,
    turns: evalCase.turns.map((turn) => ({ message: turn.message, discovery: turn.expect.discovery })),
  }),
);
