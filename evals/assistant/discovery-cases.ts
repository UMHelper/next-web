import type { TimetableContextPayload } from "@/lib/assistant/timetable-context";

import type { DiscoveryExpect } from "./discovery-grade";
import {
  DEFAULT_DISCOVERY_TIMETABLE,
  GEGA_PLAN,
  GEGA_PLAN_WITH_OVERLAP,
  NINE_CREDIT_PLAN,
  timetablePayload,
} from "./discovery-fixture";

export type DiscoveryTurn = {
  message: string;
  expect: DiscoveryExpect;
  timetable?: TimetableContextPayload;
};

export type DiscoveryEvalCase = {
  id: string;
  pathname: string;
  why: string;
  turns: DiscoveryTurn[];
  timetable?: TimetableContextPayload;
};

const gestScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { codePrefix?: string }).codePrefix === "GEST";
};

const geTopicsScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  if (typeof scope !== "object" || scope === null) return false;
  const topics = (scope as { topics?: string[] }).topics ?? [];
  return topics.some((topic) => /macao|macau|history|chinese/i.test(topic));
};

const firstYearCsScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  if (typeof scope !== "object" || scope === null) return false;
  const typed = scope as { department?: string; codePrefix?: string; maxSuggestedYear?: number };
  return (
    (typed.department === "CIS" || typed.codePrefix === "CISC") &&
    typed.maxSuggestedYear === 1
  );
};

const threeCreditScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { credits?: number }).credits === 3;
};

const explicitConstraintsArgs = (args: Record<string, unknown>) => {
  const required = args.required;
  if (typeof required !== "object" || required === null) return false;
  const typed = required as { startAfter?: string; avoidDays?: string[]; noClash?: boolean };
  return typed.startAfter === "10:00" && typed.avoidDays?.includes("FRI") === true && typed.noClash === true;
};

const impossibleWindowArgs = (args: Record<string, unknown>) => {
  const required = args.required;
  if (typeof required !== "object" || required === null) return false;
  const typed = required as { startAfter?: string; endBefore?: string };
  return typed.startAfter === "18:00" && typed.endBefore === "08:00";
};

export const DISCOVERY_CASES: DiscoveryEvalCase[] = [
  {
    id: "easy_gest",
    pathname: "/",
    why: "Journey 1: easy GEST search, follow-ups, ordinal reference, timetable fit, shortlist.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I want an easy GEST course, preferably not in the morning.",
        expect: {
          discovery: "required",
          args: gestScope,
          maxToolCalls: 3,
        },
      },
      {
        message: "Which one would you recommend and why?",
        expect: { discovery: "optional", mention: [/GEST/i], maxToolCalls: 3 },
      },
      {
        message: "Tell me more about the second one.",
        expect: { discovery: "forbidden", maxToolCalls: 3 },
      },
      {
        message: "Would any of those fit my saved timetable without clashing?",
        timetable: timetablePayload(GEGA_PLAN),
        expect: { discovery: "optional", maxToolCalls: 3 },
      },
      {
        message: "Please show the top two as recommendations.",
        expect: { discovery: "optional", maxToolCalls: 3 },
      },
    ],
  },
  {
    id: "history_ge",
    pathname: "/",
    why: "Journey 2: Macao and Chinese history GE topics.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I'm looking for a GE course about Chinese and Macao history.",
        expect: {
          discovery: "required",
          args: geTopicsScope,
          mention: [/GE|history|Macao|Macau/i],
          maxToolCalls: 3,
        },
      },
      {
        message: "Which option has the strongest history focus?",
        expect: { discovery: "optional", maxToolCalls: 3 },
      },
    ],
  },
  {
    id: "first_year_cs",
    pathname: "/",
    why: "Scenario C: first-year CS discovery.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "What first-year CS courses could I take this term?",
        expect: {
          discovery: "required",
          args: firstYearCsScope,
          mention: [/CISC|first|year|1/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "fill_credits",
    pathname: "/",
    why: "Journey 4: grow a 9-credit plan toward 18 with 3-credit fits.",
    timetable: timetablePayload(NINE_CREDIT_PLAN),
    turns: [
      {
        message: "I have 9 credits on my plan and want to reach 18. What 3-credit courses could fit?",
        expect: {
          discovery: "required",
          args: threeCreditScope,
          mention: [/credit|3|nine|18/i],
          maxToolCalls: 3,
        },
      },
      {
        message: "Do those individual picks clash with each other or my current plan?",
        expect: { discovery: "optional", maxToolCalls: 3 },
      },
    ],
  },
  {
    id: "explicit_constraints",
    pathname: "/",
    why: "Scenario E: hard time rules plus no clash with saved plan.",
    timetable: timetablePayload(GEGA_PLAN),
    turns: [
      {
        message:
          "Find GE courses with no class before 10, no Friday classes, and nothing that clashes with my saved timetable.",
        expect: {
          discovery: "required",
          args: explicitConstraintsArgs,
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "preference_conflict",
    pathname: "/",
    why: "Scenario F: easy preference conflicts with avoiding mornings.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Find really easy GE courses, but I don't want morning classes.",
        expect: {
          discovery: "required",
          forbid: [/CHAN TAI MAN[^.]{0,60}(easier|less difficult)/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "no_candidates",
    pathname: "/",
    why: "Scenario G: impossible required window yields an honest empty result.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message:
          "Find GEST courses that must start after 18:00 and end before 08:00 every meeting.",
        expect: {
          discovery: "required",
          args: impossibleWindowArgs,
          mention: [/no (suitable|match|candidate|option|course)|couldn't find|empty|none/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "planner_change",
    pathname: "/",
    why: "Journey 3: rediscover after the saved plan changes overlap.",
    timetable: timetablePayload(GEGA_PLAN),
    turns: [
      {
        message:
          "Recommend GE courses that do not clash with my timetable, with no Friday classes.",
        expect: {
          discovery: "required",
          maxToolCalls: 3,
        },
      },
      {
        message: "Show me the top two as a shortlist.",
        expect: { discovery: "optional", maxToolCalls: 3 },
      },
      {
        message: "I updated my plan—please check those picks again against my timetable.",
        timetable: timetablePayload(GEGA_PLAN_WITH_OVERLAP),
        expect: {
          discovery: "required",
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "no_midterm",
    pathname: "/",
    why: "Journey 5: midterm preference then discovery with review evidence.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I want to avoid courses with midterms.",
        expect: { discovery: "forbidden", maxToolCalls: 2 },
      },
      {
        message: "Find an easy GEST option and check student reviews for midterm mentions.",
        expect: {
          discovery: "required",
          args: gestScope,
          mention: [/midterm|review/i],
          forbid: [/(definitely|certainly) (has )?no midterm|there is no midterm/i],
          maxToolCalls: 4,
        },
      },
    ],
  },
];
