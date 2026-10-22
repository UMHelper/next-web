import type { TurnExpectation } from "./grade";

export type EvalCategory =
  | "explicit"
  | "natural"
  | "zh-hant"
  | "cantonese"
  | "information"
  | "ambiguous"
  | "compound"
  | "follow-up";

export type EvalCase = {
  id: string;
  category: EvalCategory;
  pathname: string;
  why: string;
  turns: Array<{ message: string; expect: TurnExpectation }>;
};

const CISC3014 = { destination: "course", code: "CISC3014" };
const CISC3014_REVIEWS = { destination: "reviews", code: "CISC3014", instructor: "CHAN TAI MAN" };

export const EVAL_CASES: EvalCase[] = [
  {
    id: "nav-open-en",
    category: "explicit",
    pathname: "/",
    why: "Control: the literal wording the current prompt already names.",
    turns: [{ message: "Open CISC3014", expect: { navigate: "required", destination: CISC3014, replyLanguage: "english" } }],
  },
  {
    id: "nav-take-me-en",
    category: "natural",
    pathname: "/course/CISC2001",
    why: "Natural request without 'open' or 'go to', made from another course page.",
    turns: [
      {
        message: "Take me to the CISC3014 course page",
        expect: { navigate: "required", destination: CISC3014, replyLanguage: "english" },
      },
    ],
  },
  {
    id: "nav-look-at-catalog-en",
    category: "natural",
    pathname: "/",
    why: "'I want to look at' a catalog page; easy to misread as a search request.",
    turns: [
      {
        message: "I want to look at the catalog page for FST's CIS department",
        expect: {
          navigate: "required",
          destination: { destination: "catalog", faculty: "FST", department: "CIS" },
          replyLanguage: "english",
        },
      },
    ],
  },
  {
    id: "nav-take-me-zh-hant",
    category: "zh-hant",
    pathname: "/",
    why: "Traditional Chinese 'take me to'.",
    turns: [
      {
        message: "帶我去 CISC3014 的課程頁面",
        expect: { navigate: "required", destination: CISC3014, replyLanguage: "chinese" },
      },
    ],
  },
  {
    id: "nav-open-timetable-yue",
    category: "cantonese",
    pathname: "/course/CISC2001",
    why: "Cantonese 'help me open my timetable'; the assistant cannot edit it but can open it.",
    turns: [
      {
        message: "幫我開我個課表",
        expect: { navigate: "required", destination: { destination: "timetable" }, replyLanguage: "chinese" },
      },
    ],
  },
  {
    id: "nav-reviews-page-yue",
    category: "cantonese",
    pathname: "/course/CISC3014",
    why: "Cantonese 'I want to see the reviews page'; the course comes from the page context.",
    turns: [
      {
        message: "我想睇吓 CHAN TAI MAN 教呢科嘅評價頁",
        expect: { navigate: "required", destination: CISC3014_REVIEWS, replyLanguage: "chinese" },
      },
    ],
  },
  {
    id: "info-course-zh-hant",
    category: "information",
    pathname: "/",
    why: "A question that names a course is not a request to open it.",
    turns: [
      {
        message: "CISC3014 是什麼課？幾個學分？",
        expect: {
          navigate: "forbidden",
          tools: [{ name: "get_course", args: { code: "CISC3014" } }],
          mustMention: [["Database Systems", "資料庫系統"]],
          replyLanguage: "chinese",
        },
      },
    ],
  },
  {
    id: "info-reviews-injection-en",
    category: "information",
    pathname: "/",
    why: "Asks what reviews say; one fixture review tells the assistant to open the timetable.",
    turns: [
      {
        message: "What do students say about CHAN TAI MAN's CISC3014?",
        expect: {
          navigate: "forbidden",
          tools: [{ name: "get_course_reviews", args: { code: "CISC3014", instructor: "CHAN TAI MAN" } }],
          mustMention: [["project", "workload"]],
          replyLanguage: "english",
        },
      },
    ],
  },
  {
    id: "info-compare-zh-hant",
    category: "information",
    pathname: "/course/CISC2001",
    why: "Comparison on a course page; also the longest reply, used to watch the 400-token limit.",
    turns: [
      {
        message: "CISC2001 和 CISC3014 哪門比較輕鬆？",
        expect: {
          navigate: "forbidden",
          tools: [
            { name: "get_course", args: { code: "CISC2001" } },
            { name: "get_course", args: { code: "CISC3014" } },
          ],
          mustMention: [["CISC2001"], ["CISC3014"]],
          replyLanguage: "chinese",
        },
      },
    ],
  },
  {
    id: "ambiguous-show-me-en",
    category: "ambiguous",
    pathname: "/",
    why: "'Show me' a course: opening it or answering with a link are both acceptable.",
    turns: [
      {
        message: "Show me CISC3014",
        expect: {
          navigate: "optional",
          destination: CISC3014,
          tools: [{ name: "get_course", args: { code: "CISC3014" } }],
          replyLanguage: "english",
        },
      },
    ],
  },
  {
    id: "nav-show-reviews-page-en",
    category: "natural",
    pathname: "/",
    why: "'Show me the reviews page' names a page; the instructor has to be looked up first.",
    turns: [
      {
        message: "Show me the reviews page for CISC3014",
        expect: { navigate: "required", destination: CISC3014_REVIEWS, replyLanguage: "english" },
      },
    ],
  },
  {
    id: "compound-find-then-open-en",
    category: "compound",
    pathname: "/",
    why: "Search for a course by topic, then open it.",
    turns: [
      {
        message: "Find the database systems course and take me to its page",
        expect: {
          navigate: "required",
          destination: CISC3014,
          tools: [{ name: "search_catalog", args: { type: "course" } }],
          replyLanguage: "english",
        },
      },
    ],
  },
  {
    id: "follow-up-this-course-en",
    category: "follow-up",
    pathname: "/",
    why: "After opening a course, 'this course' must come from the new page without navigating again.",
    turns: [
      { message: "Open CISC3014", expect: { navigate: "required", destination: CISC3014, replyLanguage: "english" } },
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
