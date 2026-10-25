import type { ReplyLanguage } from "./grade";
import type { AgentBehaviorCase } from "./agent-behavior-cases";

export type AgentBehaviorHoldoutTurn = AgentBehaviorCase["turns"][number] & {
  replyLanguage?: ReplyLanguage;
  chineseScript?: "traditional";
};

export type AgentBehaviorHoldoutCase = Omit<AgentBehaviorCase, "turns"> & {
  turns: AgentBehaviorHoldoutTurn[];
};

export const AGENT_BEHAVIOR_HOLDOUT_CASES: AgentBehaviorHoldoutCase[] = [
  {
    id: "holdout-evaluate",
    pathname: "/",
    why: "Holdout paraphrase of course evaluation.",
    turns: [
      {
        message: "Is GELH1000 worth it?",
        expect: {
          requiredTools: ["get_course"],
          card: "any",
          mention: [/\d+ reviews?/],
          forbid: [/CHAN TAI MAN[^.]{0,60}easier/i],
        },
      },
    ],
  },
  {
    id: "holdout-tell_more",
    pathname: "/",
    why: "Holdout paraphrase of tell me more.",
    turns: [{ message: "Can you give me the rundown on GELH1000?", expect: { card: "detail" } }],
  },
  {
    id: "holdout-quick_fact",
    pathname: "/",
    why: "Holdout terse credit question.",
    turns: [
      {
        message: "GEST1004 credits?",
        expect: { card: "none", forbiddenTools: ["get_course_reviews"] },
      },
    ],
  },
  {
    id: "holdout-instructor_easier",
    pathname: "/",
    why: "Holdout casual instructor comparison.",
    turns: [
      {
        message: "Who's the chiller prof for GELH1000?",
        expect: {
          card: "none",
          mention: [/LEE MEI LING/],
          forbid: [/CHAN TAI MAN[^.]{0,60}(easier|less difficult)/i],
        },
      },
    ],
  },
  {
    id: "holdout-no_midterm",
    pathname: "/",
    why: "Holdout midterm preference in one turn.",
    turns: [
      {
        message: "I'd rather avoid courses with midterms. What about GEST1004?",
        expect: {
          requiredTools: ["get_course_reviews"],
          card: "none_or_any",
          mention: [/midterm/i],
          forbid: [/(definitely|certainly) (has )?no midterm|there is no midterm/i],
        },
      },
    ],
  },
  {
    id: "holdout-evaluate-zh",
    pathname: "/",
    why: "Traditional Chinese evaluation (Review Focus 5).",
    turns: [
      {
        message: "GELH1000 值得修嗎？",
        replyLanguage: "chinese",
        chineseScript: "traditional",
        expect: {
          requiredTools: ["get_course"],
          card: "any",
          mention: [/\d+ reviews?/],
          forbid: [/CHAN TAI MAN[^.]{0,60}easier/i],
        },
      },
    ],
  },
  {
    id: "holdout-alternatives",
    pathname: "/",
    why: "Holdout alternatives phrasing.",
    turns: [
      {
        message: "Anything similar to GELH1000?",
        expect: {
          requiredTools: ["search_catalog"],
          card: "none_or_any",
          mention: [/GELH/],
          forbid: [/ACCT\d{4}/],
        },
      },
    ],
  },
  {
    id: "holdout-sections",
    pathname: "/",
    why: "Schedule question stays text-first without forcing section cards.",
    turns: [
      {
        message: "When does GELH1000 meet with LEE MEI LING?",
        expect: { card: "none" },
      },
    ],
  },
];
