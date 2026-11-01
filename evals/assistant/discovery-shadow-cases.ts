import type { DiscoveryEvalCase } from "./discovery-cases";
import { DEFAULT_DISCOVERY_TIMETABLE, GEGA_PLAN, timetablePayload } from "./discovery-fixture";

// Written independently of dev-v2 and holdout-v1, then frozen before the first live run.
// Secondary evidence only: this set never replaces the release gate.

const intentPriorityScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  if (typeof scope !== "object" || scope === null) return false;
  const typed = scope as { department?: string; codePrefix?: string; maxSuggestedYear?: number };
  return (
    (typed.department === "CIS" || typed.codePrefix === "CISC") &&
    typed.maxSuggestedYear === 1
  );
};

const gestScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { codePrefix?: string }).codePrefix === "GEST";
};

const creditScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { credits?: number }).credits === 3;
};

export const SHADOW_CASES_V1: DiscoveryEvalCase[] = [
  {
    id: "shadow-catalog_browse",
    pathname: "/",
    why: "Pure listing: browsing first-year GE options stays cheap and needs no ranked recommendation.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Can you show me which first-year general education courses exist this term?",
        expect: {
          discovery: "optional",
          mention: [/GEST100[1-8]|GEGA100[0-2]|GESB101[0-5]/],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow-new_major_priorities",
    pathname: "/",
    why: "Personalized recommendation: a new CIS student asks which introductory courses to prioritize first.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I just joined the CIS major—which intro computing courses should I prioritize in year one?",
        expect: {
          discovery: "required",
          args: intentPriorityScope,
          mention: [/CISC100[12]/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow-credit_en",
    pathname: "/",
    why: "English credit target: one actionable anchor with no department, degree or eligibility assumption.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I need three more credits to stay on track—what 3-credit courses would you recommend?",
        expect: {
          discovery: "required",
          args: creditScope,
          mention: [/3|three|credit/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow-credit_zh_hans",
    pathname: "/",
    why: "Simplified Chinese credit target keeps the same bounded discovery behaviour.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "我还差三个学分才够要求，有哪些三门学分的课可以推荐？",
        expect: {
          discovery: "required",
          args: creditScope,
          mention: [/学分|credit/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow-credit_zh_hant",
    pathname: "/",
    why: "Traditional Chinese credit target keeps the same bounded discovery behaviour.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "我還差三個學分先夠數，有咩三學分嘅科目可以推介？",
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
    id: "shadow-workload_reviews",
    pathname: "/",
    why: "Workload-sensitive shortlist: discovery should surface review evidence instead of re-reading every candidate.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Which GEST courses feel light on workload according to student reviews?",
        expect: {
          discovery: "required",
          args: gestScope,
          mention: [/work ?load|review|reading|heavy/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "shadow-no_midterm_insufficient",
    pathname: "/",
    why: "No-midterm preference where review text is missing or unreadable; the reply must not turn absence into certainty.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I really want a GEST course with no midterm at all.",
        expect: {
          discovery: "required",
          args: gestScope,
          mention: [/midterm/i, /review|evidence|confirm|not sure|can't tell|cannot tell|unclear|limited/i],
          forbid: [
            /(?:definitely|certainly|guaranteed|confirmed|for sure)[^.!?]{0,40}no midterm|no midterm[^.!?]{0,40}(?:definitely|certainly|guaranteed|confirmed|for sure)|there (?:is|are) no midterms?|[A-Z]{2,4}\d{4}[^.!?]{0,40}(?:has|have) no midterms?/i,
          ],
          maxToolCalls: 4,
        },
      },
    ],
  },
  {
    id: "shadow-multi_section_fit",
    pathname: "/",
    why: "Multi-section compatibility against a saved plan: name a workable section without claiming sections fit each other.",
    timetable: timetablePayload(GEGA_PLAN),
    turns: [
      {
        message: "If I add GEST1006, is there a section that fits around my saved timetable?",
        expect: {
          discovery: "optional",
          mention: [/GEST1006/i, /002/],
          forbid: [/fit together|compatible with each other|互相兼容|彼此兼容/i],
          maxToolCalls: 4,
        },
      },
    ],
  },
];

type FrozenShadowTurn = { message: string; discovery: "required" | "optional" | "forbidden" };

export const FROZEN_SHADOW_V1: Array<{ id: string; turns: FrozenShadowTurn[] }> = [
  {
    id: "shadow-catalog_browse",
    turns: [
      {
        message: "Can you show me which first-year general education courses exist this term?",
        discovery: "optional",
      },
    ],
  },
  {
    id: "shadow-new_major_priorities",
    turns: [
      {
        message: "I just joined the CIS major—which intro computing courses should I prioritize in year one?",
        discovery: "required",
      },
    ],
  },
  {
    id: "shadow-credit_en",
    turns: [
      {
        message: "I need three more credits to stay on track—what 3-credit courses would you recommend?",
        discovery: "required",
      },
    ],
  },
  {
    id: "shadow-credit_zh_hans",
    turns: [
      {
        message: "我还差三个学分才够要求，有哪些三门学分的课可以推荐？",
        discovery: "required",
      },
    ],
  },
  {
    id: "shadow-credit_zh_hant",
    turns: [
      {
        message: "我還差三個學分先夠數，有咩三學分嘅科目可以推介？",
        discovery: "required",
      },
    ],
  },
  {
    id: "shadow-workload_reviews",
    turns: [
      {
        message: "Which GEST courses feel light on workload according to student reviews?",
        discovery: "required",
      },
    ],
  },
  {
    id: "shadow-no_midterm_insufficient",
    turns: [
      {
        message: "I really want a GEST course with no midterm at all.",
        discovery: "required",
      },
    ],
  },
  {
    id: "shadow-multi_section_fit",
    turns: [
      {
        message: "If I add GEST1006, is there a section that fits around my saved timetable?",
        discovery: "optional",
      },
    ],
  },
];
