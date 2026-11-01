import type { DiscoveryEvalCase } from "./discovery-cases";
import { DEFAULT_DISCOVERY_TIMETABLE, GEGA_PLAN, timetablePayload } from "./discovery-fixture";

// New paraphrases for B.3 efficiency diagnosis. Frozen before the baseline run;
// diagnostic only, never a release gate.

const gestScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { codePrefix?: string }).codePrefix === "GEST";
};

const cisScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  if (typeof scope !== "object" || scope === null) return false;
  const typed = scope as { department?: string; codePrefix?: string; maxSuggestedYear?: number };
  return (
    (typed.department === "CIS" || typed.codePrefix === "CISC" || typed.codePrefix === "CISC1") &&
    typed.maxSuggestedYear === 1
  );
};

export const EFFICIENCY_CASES_V1: DiscoveryEvalCase[] = [
  {
    id: "eff-no_match_evening",
    pathname: "/",
    why: "Complete zero-match after a hard time constraint; the model must not enumerate every GEST course to double-check.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Are there any GEST classes that begin after 6pm?",
        expect: {
          discovery: "required",
          args: gestScope,
          mention: [/no [^.!?]{0,40}(class|course|section)|none|nothing|relax|different/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "eff-no_match_topic",
    pathname: "/",
    why: "A second complete zero-match wording, this time by topic, to test the no-match evidence rather than one sentence.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Is there a GEST course about marine biology this term?",
        expect: {
          discovery: "required",
          args: gestScope,
          mention: [/no [^.!?]{0,40}(class|course|section)|none|nothing|not (?:listed|offered)|relax|different/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "eff-browse_ge",
    pathname: "/",
    why: "Catalog listing with a first-year filter; one scoped catalog call should answer it.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Give me the list of general-education courses open to first-years this semester.",
        expect: {
          discovery: "optional",
          mention: [/GEST100|GEGA100|GESB101/],
          maxToolCalls: 2,
        },
      },
    ],
  },
  {
    id: "eff-cis_advice",
    pathname: "/",
    why: "First-year computing advice needs a recommendation plus descriptions; measure whether the discovery evidence is reused.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I'm starting a computing degree—which first-year CISC courses should I take first?",
        expect: {
          discovery: "required",
          args: cisScope,
          mention: [/CISC100[12]/i],
          maxToolCalls: 5,
        },
      },
    ],
  },
  {
    id: "eff-combined_preview",
    pathname: "/",
    why: "Two named sections need a combined preview; section identities are already in the message.",
    timetable: timetablePayload(GEGA_PLAN),
    turns: [
      {
        message: "Do GEST1006-002 and GEST1005-001 overlap each other or my saved plan?",
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
    id: "eff-detail_followup",
    pathname: "/",
    why: "A two-turn shortlist then a detailed follow-up; the second turn must use targeted course tools, not discovery.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Find an easy GEST option that does not start in the morning.",
        expect: {
          discovery: "required",
          args: gestScope,
          maxToolCalls: 3,
        },
      },
      {
        message: "Tell me more about the second option and who teaches it.",
        expect: {
          discovery: "forbidden",
          mention: [/GEST/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "eff-review_workload",
    pathname: "/",
    why: "Review-sensitive recommendation; reuse discovery review evidence and preserve missing-text uncertainty.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Which GEST courses have light workloads according to student reviews?",
        expect: {
          discovery: "required",
          args: gestScope,
          mention: [/work ?load|review/i],
          maxToolCalls: 4,
        },
      },
    ],
  },
  {
    id: "eff-factual_course",
    pathname: "/",
    why: "Named-course fact; one course lookup, no discovery.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "What faculty runs CISC1001, and how many credits is it?",
        expect: {
          discovery: "forbidden",
          mention: [/CISC1001/i, /3|three/],
          maxToolCalls: 2,
        },
      },
    ],
  },
];

type FrozenEfficiencyTurn = { message: string; discovery: "required" | "optional" | "forbidden" };

export const FROZEN_EFFICIENCY_V1: Array<{ id: string; turns: FrozenEfficiencyTurn[] }> = [
  {
    id: "eff-no_match_evening",
    turns: [{ message: "Are there any GEST classes that begin after 6pm?", discovery: "required" }],
  },
  {
    id: "eff-no_match_topic",
    turns: [{ message: "Is there a GEST course about marine biology this term?", discovery: "required" }],
  },
  {
    id: "eff-browse_ge",
    turns: [
      {
        message: "Give me the list of general-education courses open to first-years this semester.",
        discovery: "optional",
      },
    ],
  },
  {
    id: "eff-cis_advice",
    turns: [
      {
        message: "I'm starting a computing degree—which first-year CISC courses should I take first?",
        discovery: "required",
      },
    ],
  },
  {
    id: "eff-combined_preview",
    turns: [
      {
        message: "Do GEST1006-002 and GEST1005-001 overlap each other or my saved plan?",
        discovery: "forbidden",
      },
    ],
  },
  {
    id: "eff-detail_followup",
    turns: [
      {
        message: "Find an easy GEST option that does not start in the morning.",
        discovery: "required",
      },
      {
        message: "Tell me more about the second option and who teaches it.",
        discovery: "forbidden",
      },
    ],
  },
  {
    id: "eff-review_workload",
    turns: [
      {
        message: "Which GEST courses have light workloads according to student reviews?",
        discovery: "required",
      },
    ],
  },
  {
    id: "eff-factual_course",
    turns: [
      {
        message: "What faculty runs CISC1001, and how many credits is it?",
        discovery: "forbidden",
      },
    ],
  },
];
