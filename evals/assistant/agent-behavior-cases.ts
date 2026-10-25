import type { AgentBehaviorExpect } from "./agent-behavior-grade";

export type AgentBehaviorTurn = {
  message: string;
  expect: AgentBehaviorExpect;
};

export type AgentBehaviorCase = {
  id: string;
  pathname: string;
  why: string;
  turns: AgentBehaviorTurn[];
};

export const AGENT_BEHAVIOR_CASES: AgentBehaviorCase[] = [
  {
    id: "quick_fact",
    pathname: "/",
    why: "Credit questions stay text-only and skip review reads.",
    turns: [
      {
        message: "How many credits is GEST1004?",
        expect: { card: "none", forbiddenTools: ["get_course_reviews"] },
      },
    ],
  },
  {
    id: "explain",
    pathname: "/",
    why: "Plain course explanation stays text-first.",
    turns: [{ message: "What is GEST1004?", expect: { card: "none" } }],
  },
  {
    id: "evaluate",
    pathname: "/",
    why: "Natural evaluation uses course data and review counts without wrong difficulty direction.",
    turns: [
      {
        message: "I'm considering taking GELH1000. Is it difficult?",
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
    id: "tell_more",
    pathname: "/",
    why: "Tell me more should surface a detail card.",
    turns: [{ message: "Tell me more about GELH1000.", expect: { card: "detail" } }],
  },
  {
    id: "journey_explore",
    pathname: "/",
    why: "Multi-turn exploration ends with a detail card and no false card claims.",
    turns: [
      { message: "What is GELH1000?", expect: { card: "none" } },
      { message: "I'm considering taking it.", expect: { card: "any" } },
      { message: "Tell me more.", expect: { card: "detail" } },
    ],
  },
  {
    id: "instructor_easier",
    pathname: "/",
    why: "Instructor comparison names the easier professor using rating direction.",
    turns: [
      {
        message: "Which professor is easier for GELH1000?",
        expect: {
          card: "none",
          mention: [/LEE MEI LING/],
          forbid: [/CHAN TAI MAN[^.]{0,60}(easier|less difficult)/i],
        },
      },
    ],
  },
  {
    id: "workload",
    pathname: "/",
    why: "Workload questions read reviews; cards optional.",
    turns: [
      {
        message: "What do students say about the workload in GELH1000?",
        expect: { requiredTools: ["get_course_reviews"], card: "none_or_any" },
      },
    ],
  },
  {
    id: "no_midterm",
    pathname: "/",
    why: "Midterm preference applies to a follow-up course without certainty violations.",
    turns: [
      { message: "I don't want a midterm.", expect: { card: "none" } },
      {
        message: "How about GEST1004?",
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
    id: "alternatives",
    pathname: "/",
    why: "Alternatives stay in the GELH subject area.",
    turns: [
      { message: "I'm considering GELH1000.", expect: { card: "any" } },
      {
        message: "Can you suggest alternatives?",
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
    id: "sections",
    pathname: "/",
    why: "Explicit section request shows section cards.",
    turns: [
      {
        message: "Show me the available sections of GELH1000 with LEE MEI LING.",
        expect: { card: "sections" },
      },
    ],
  },
  {
    id: "partial_failure",
    pathname: "/",
    why: "Mixed search success and failure stays honest.",
    turns: [
      {
        message: "Find GEST and GELH courses.",
        expect: {
          card: "none_or_any",
          forbid: [/no (matching )?courses/i],
          mention: [/(couldn't|could not|unable)/i],
        },
      },
    ],
  },
  {
    id: "compare_courses",
    pathname: "/",
    why: "Two-course comparison avoids stacked detail cards.",
    turns: [
      {
        message: "Compare GELH1000 and GEST1004.",
        expect: { card: "none", maxDetailCards: 1 },
      },
    ],
  },
];
