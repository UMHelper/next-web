import { EVAL_CASES, type EvalCase } from "./cases";

const infoCompare = EVAL_CASES.find((evalCase) => evalCase.id === "info-compare-zh-hant");
if (!infoCompare) throw new Error("info-compare-zh-hant is missing from EVAL_CASES");

const CISC3014_OVERVIEW_TOOLS = [
  { name: "get_course" as const, args: { code: "CISC3014" } },
  { name: "get_course_reviews" as const, args: { code: "CISC3014", instructor: "CHAN TAI MAN" } },
  { name: "get_course_sections" as const, args: { code: "CISC3014", instructor: "CHAN TAI MAN" } },
];

/** Phase 2 output-budget suite: long Traditional Chinese comparisons and explanations, plus one English control. */
export const TOKEN_CASES: EvalCase[] = [
  infoCompare,
  {
    id: "tokens-compare-instructors-zh-hant",
    category: "information",
    pathname: "/course/CISC2001",
    why: "Compares two instructors of the current course on ratings and reviews.",
    turns: [
      {
        message: "這門課的 WONG KA KI 和 LI MEI 哪位比較適合我？請比較評分、給分、出席和學生評價。",
        expect: {
          navigate: "forbidden",
          tools: [
            { name: "get_course_reviews", args: { code: "CISC2001", instructor: "WONG KA KI" } },
            { name: "get_course_reviews", args: { code: "CISC2001", instructor: "LI MEI" } },
          ],
          mustMention: [["WONG KA KI"], ["LI MEI"]],
          replyLanguage: "chinese",
        },
      },
    ],
  },
  {
    id: "tokens-explain-course-zh-hant",
    category: "information",
    pathname: "/",
    why: "A long explanation that needs the course, its reviews and its sections.",
    turns: [
      {
        message: "請詳細介紹 CISC3014：課程內容、學分、授課老師、學生評價和上課時間。",
        expect: {
          navigate: "forbidden",
          tools: CISC3014_OVERVIEW_TOOLS,
          mustMention: [["資料庫系統", "Database Systems"], ["CHAN TAI MAN"], ["10:00"]],
          replyLanguage: "chinese",
        },
      },
    ],
  },
  {
    id: "tokens-explain-course-en",
    category: "information",
    pathname: "/",
    why: "English control for the same explanation, to separate reply language from reply length.",
    turns: [
      {
        message:
          "Give me a detailed overview of CISC3014: what it covers, credits, who teaches it, what students say, and when it meets.",
        expect: {
          navigate: "forbidden",
          tools: CISC3014_OVERVIEW_TOOLS,
          mustMention: [["Database Systems"], ["CHAN TAI MAN"], ["10:00"]],
          replyLanguage: "english",
        },
      },
    ],
  },
];
