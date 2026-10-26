import type { DiscoveryEvalCase } from "./discovery-cases";
import { DEFAULT_DISCOVERY_TIMETABLE, timetablePayload, GEGA_PLAN } from "./discovery-fixture";

const gestScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { codePrefix?: string }).codePrefix === "GEST";
};

const geScope = (args: Record<string, unknown>) => {
  const scope = args.scope;
  return typeof scope === "object" && scope !== null && (scope as { courseType?: string }).courseType === "GE";
};

export const DISCOVERY_HOLDOUT_CASES: DiscoveryEvalCase[] = [
  {
    id: "holdout-easy_ge",
    pathname: "/",
    why: "Holdout paraphrase of easy afternoon GEST search.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Any chill GEST classes that aren't early mornings?",
        expect: {
          discovery: "required",
          args: gestScope,
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "holdout-history_ge",
    pathname: "/",
    why: "Holdout paraphrase of Macao/Chinese history GE search.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "Got a GE about Macau history or Chinese heritage?",
        expect: {
          discovery: "required",
          mention: [/GE|history|Macau|Macao|Chinese/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "holdout-first_year_cs",
    pathname: "/",
    why: "Holdout paraphrase of first-year CS discovery.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I'm a year-one student—what CIS intro courses are offered?",
        expect: {
          discovery: "required",
          mention: [/CISC|CIS|first|year|1/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "holdout-constraints_zh",
    pathname: "/",
    why: "Traditional Chinese explicit constraints with saved plan.",
    timetable: timetablePayload(GEGA_PLAN),
    turns: [
      {
        message: "幫我搵通識課：不要十點前上堂、不要星期五，同我時間表唔好衝突。",
        expect: {
          discovery: "required",
          args: geScope,
          maxToolCalls: 3,
        },
      },
    ],
  },
  {
    id: "holdout-no_midterm",
    pathname: "/",
    why: "Holdout midterm preference in one turn.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "I'd rather skip courses with midterms—any easy GEST picks?",
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
  {
    id: "holdout-fill_credits_zh",
    pathname: "/",
    why: "Simplified Chinese paraphrase of filling credits.",
    timetable: DEFAULT_DISCOVERY_TIMETABLE,
    turns: [
      {
        message: "我还差学分，有没有三门学分的课可以推荐？",
        expect: {
          discovery: "required",
          mention: [/学分|3|credit/i],
          maxToolCalls: 3,
        },
      },
    ],
  },
];
