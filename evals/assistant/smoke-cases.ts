import type { EvalCase } from "./cases";

/** Exercises every thinking-mode continuation path: steps inside one run, a frontend follow-up run, and a later turn. */
export const SMOKE_CASES: EvalCase[] = [
  {
    id: "smoke-thinking-continuation",
    category: "compound",
    language: "en",
    pathname: "/",
    why: "search_catalog (server tool), navigate (frontend tool and follow-up run), then a follow-up question.",
    turns: [
      {
        message: "Find the database systems course and take me to its page",
        expect: {
          navigate: "required",
          destination: { destination: "course", code: "CISC3014" },
          tools: [{ name: "search_catalog", args: { type: "course" } }],
          replyLanguage: "english",
        },
      },
      {
        message: "Who teaches this course?",
        expect: {
          navigate: "forbidden",
          tools: [{ name: "get_course", args: { code: "CISC3014" } }],
          mustMention: [["CHAN TAI MAN"]],
          replyLanguage: "english",
        },
      },
    ],
  },
];
