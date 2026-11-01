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

const eveningStartArgs = (args: Record<string, unknown>) => {
  const required = args.required;
  if (typeof required !== "object" || required === null) return false;
  const typed = required as { startAfter?: string; endBefore?: string };
  return typed.startAfter === "18:00" && (typed.endBefore === undefined || typed.endBefore > "18:00");
};

export const DISCOVERY_CASES_V1: DiscoveryEvalCase[] = [
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

function cloneDiscoveryExpect(expect: DiscoveryExpect): DiscoveryExpect {
  return {
    discovery: expect.discovery,
    ...(expect.args ? { args: expect.args } : {}),
    ...(expect.mention
      ? { mention: expect.mention.map((pattern) => new RegExp(pattern.source, pattern.flags)) }
      : {}),
    ...(expect.forbid
      ? { forbid: expect.forbid.map((pattern) => new RegExp(pattern.source, pattern.flags)) }
      : {}),
    ...(expect.maxToolCalls !== undefined ? { maxToolCalls: expect.maxToolCalls } : {}),
  };
}

function cloneDiscoveryCase(evalCase: DiscoveryEvalCase): DiscoveryEvalCase {
  return {
    id: evalCase.id,
    pathname: evalCase.pathname,
    why: evalCase.why,
    ...(evalCase.timetable ? { timetable: evalCase.timetable } : {}),
    turns: evalCase.turns.map((turn) => ({
      message: turn.message,
      ...(turn.timetable ? { timetable: turn.timetable } : {}),
      expect: cloneDiscoveryExpect(turn.expect),
    })),
  };
}

const noCandidatesInvalidWindow: DiscoveryEvalCase = {
  id: "no_candidates_invalid_window",
  pathname: "/",
  why: "spec §13; no_candidates dev r0/r1",
  timetable: DEFAULT_DISCOVERY_TIMETABLE,
  turns: [
    {
      message: "Find GEST courses that must start after 18:00 and end before 08:00 every meeting.",
      expect: {
        discovery: "optional",
        mention: [
          /can(?:'|no)t (?:both )?hold|contradict|impossible|no (class|section|course)|window is empty/i,
        ],
        forbid: [
          /(?<!\b(?:no|not|can(?:'|no)?t)\s+)shortlist|I recommend|here are (the |some )?(courses|options|classes)|top \d/i,
        ],
        maxToolCalls: 3,
      },
    },
  ],
};

const noCandidatesUnsatisfiable: DiscoveryEvalCase = {
  id: "no_candidates",
  pathname: "/",
  why: "spec §4 scenario G; dev r2 behaviour",
  timetable: DEFAULT_DISCOVERY_TIMETABLE,
  turns: [
    {
      message: "Find GEST courses that have to start after 18:00.",
      expect: {
        discovery: "required",
        args: eveningStartArgs,
        mention: [/no [^.!?]{0,30}(course|class|section|option)|nothing (matches|fits)|none/i],
        maxToolCalls: 3,
      },
    },
  ],
};

const factualLookup: DiscoveryEvalCase = {
  id: "factual_lookup",
  pathname: "/",
  why: "mission §3/§8; over-selection risk of the new contract",
  timetable: DEFAULT_DISCOVERY_TIMETABLE,
  turns: [
    {
      message: "How many credits is CISC1001?",
      expect: { discovery: "forbidden", maxToolCalls: 2 },
    },
  ],
};

const creditOnlyEn: DiscoveryEvalCase = {
  id: "credit_only_en",
  pathname: "/",
  why: "B.2 priority 2: a credit target alone is actionable; do not ask for a direction first.",
  timetable: DEFAULT_DISCOVERY_TIMETABLE,
  turns: [
    {
      message: "I need three more credits this term—recommend some 3-credit courses.",
      expect: {
        discovery: "required",
        args: threeCreditScope,
        mention: [/credit|3|three/i],
        maxToolCalls: 3,
      },
    },
  ],
};

const creditOnlyZhHans: DiscoveryEvalCase = {
  id: "credit_only_zh_hans",
  pathname: "/",
  why: "B.2 priority 2: the same credit-only action in Simplified Chinese.",
  timetable: DEFAULT_DISCOVERY_TIMETABLE,
  turns: [
    {
      message: "我下学期还差3个学分，能推荐一些三学分的课程吗？",
      expect: {
        discovery: "required",
        args: threeCreditScope,
        mention: [/学分|學分|credit/i],
        maxToolCalls: 3,
      },
    },
  ],
};

const creditOnlyZhHant: DiscoveryEvalCase = {
  id: "credit_only_zh_hant",
  pathname: "/",
  why: "B.2 priority 2: the same credit-only action in Traditional Chinese.",
  timetable: DEFAULT_DISCOVERY_TIMETABLE,
  turns: [
    {
      message: "我下學期仲差三個學分，可唔可以推介啲三學分嘅科目？",
      expect: {
        discovery: "required",
        args: threeCreditScope,
        mention: [/學分|credit/i],
        maxToolCalls: 3,
      },
    },
  ],
};

const catalogBrowse: DiscoveryEvalCase = {
  id: "catalog_browse",
  pathname: "/",
  why: "amendment 1: browsing must stay cheap",
  timetable: DEFAULT_DISCOVERY_TIMETABLE,
  turns: [
    {
      message: "List all first-year CIS courses.",
      expect: {
        discovery: "optional",
        mention: [/CISC100[123]/],
        maxToolCalls: 3,
      },
    },
  ],
};

function plannerChangeV2(evalCase: DiscoveryEvalCase): DiscoveryEvalCase {
  const cloned = cloneDiscoveryCase(evalCase);
  const turn = cloned.turns[2];
  cloned.turns[2] = {
    message: turn.message,
    ...(turn.timetable ? { timetable: turn.timetable } : {}),
    expect: {
      discovery: "optional",
      mention: [/re-?check|again|updated|current plan/i],
      maxToolCalls: 3,
    },
  };
  return cloned;
}

export const DISCOVERY_CASES_V2: DiscoveryEvalCase[] = [
  ...DISCOVERY_CASES_V1.flatMap((evalCase) => {
    if (evalCase.id === "no_candidates") return [noCandidatesInvalidWindow, noCandidatesUnsatisfiable];
    if (evalCase.id === "planner_change") return [plannerChangeV2(evalCase)];
    return [cloneDiscoveryCase(evalCase)];
  }),
  creditOnlyEn,
  creditOnlyZhHans,
  creditOnlyZhHant,
  factualLookup,
  catalogBrowse,
];

export const DISCOVERY_CASES = DISCOVERY_CASES_V2;
