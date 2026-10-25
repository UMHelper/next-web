import type { CaseLanguage, EvalCase } from "./cases";
import type { ReplyLanguage, TurnExpectation } from "./grade";

/** Holdout: the same student goals in six language groups, never used to tune the prompt. */
export const SEMANTIC_SCENARIOS = [
  "info",
  "open",
  "reviews-named",
  "reviews-one",
  "reviews-many",
  "find-open",
  "here-choose",
  "unavailable",
] as const;
type Scenario = (typeof SEMANTIC_SCENARIOS)[number];

const REPLY_LANGUAGE: Record<CaseLanguage, ReplyLanguage> = {
  en: "english",
  "zh-hant": "chinese",
  yue: "chinese",
  "mixed-yue-en": "chinese",
  ko: "korean",
  "mixed-ko-en": "korean",
  ja: "japanese",
};

const CISC3014 = { destination: "course", code: "CISC3014" };
const CISC2001 = { destination: "course", code: "CISC2001" };
const NAMED_REVIEWS = { destination: "reviews", code: "CISC2001", instructor: "LI MEI" };
const ONLY_REVIEWS = { destination: "reviews", code: "CISC3014", instructor: "CHAN TAI MAN" };
export const PICKED_REVIEWS = { destination: "reviews", code: "CISC2001", instructor: "WONG KA KI" };
export const UNAVAILABLE_REVIEWS = { destination: "reviews", code: "CISC3014", instructor: "LI MEI" } as const;
const lookUp = (code: string) => [{ name: "get_course" as const, args: { code } }];

type Expectation = Omit<TurnExpectation, "replyLanguage">;
type Base = Pick<EvalCase, "category" | "intent" | "pathname" | "why">;

const CLARIFY_CISC2001: Expectation = {
  navigate: "clarify",
  tools: lookUp("CISC2001"),
  options: ["WONG KA KI", "LI MEI"],
  requestedPage: "reviews",
};

function semanticCase(scenario: Scenario, language: CaseLanguage, base: Base, turns: Array<[string, Expectation]>): EvalCase {
  return {
    id: `sa-${scenario}-${language}`,
    language,
    ...base,
    turns: turns.map(([message, expect]) => ({ message, expect: { ...expect, replyLanguage: REPLY_LANGUAGE[language] } })),
  };
}

const info = (language: CaseLanguage, message: string, gloss = message) =>
  semanticCase(
    "info",
    language,
    { category: "information", intent: "course-info", pathname: "/", why: `A question, not a page request: '${gloss}'.` },
    [[message, { navigate: "forbidden", tools: lookUp("CISC3014"), mustMention: [["CHAN TAI MAN"]] }]],
  );

const open = (language: CaseLanguage, message: string, gloss = message) =>
  semanticCase(
    "open",
    language,
    {
      category: "natural",
      intent: "course-page",
      pathname: "/course/CISC2001",
      why: `A clear request for another course's page: '${gloss}'.`,
    },
    [[message, { navigate: "required", destination: CISC3014, requestedPage: "course" }]],
  );

const reviewsNamed = (language: CaseLanguage, message: string, gloss = message) =>
  semanticCase(
    "reviews-named",
    language,
    {
      category: "natural",
      intent: "reviews-named",
      pathname: "/",
      why: `A reviews page with the instructor named: validate and open it: '${gloss}'.`,
    },
    [[message, { navigate: "required", destination: NAMED_REVIEWS, requestedPage: "reviews" }]],
  );

const reviewsOne = (language: CaseLanguage, message: string, gloss = message) =>
  semanticCase(
    "reviews-one",
    language,
    {
      category: "natural",
      intent: "reviews-one-instructor",
      pathname: "/",
      why: `A reviews page with no instructor, for a course one instructor taught: look up, then open: '${gloss}'.`,
    },
    [[message, { navigate: "required", destination: ONLY_REVIEWS, tools: lookUp("CISC3014"), requestedPage: "reviews" }]],
  );

const reviewsMany = (language: CaseLanguage, message: string, gloss = message) =>
  semanticCase(
    "reviews-many",
    language,
    {
      category: "missing-parameter",
      intent: "reviews-many-instructors",
      pathname: "/",
      why: `A reviews page with no instructor, for a course two instructors taught: list both and ask, open nothing: '${gloss}'.`,
    },
    [[message, CLARIFY_CISC2001]],
  );

const findOpen = (language: CaseLanguage, message: string, gloss = message) =>
  semanticCase(
    "find-open",
    language,
    {
      category: "compound",
      intent: "find-then-open",
      pathname: "/",
      why: `Search by topic, then open the course found: '${gloss}'.`,
    },
    [
      [
        message,
        { navigate: "required", destination: CISC2001, tools: [{ name: "search_catalog", args: { type: "course" } }], requestedPage: "course" },
      ],
    ],
  );

const hereChoose = (language: CaseLanguage, [ask, choose]: [string, string], gloss = `${ask} / ${choose}`) =>
  semanticCase(
    "here-choose",
    language,
    {
      category: "follow-up",
      intent: "here-then-choose",
      pathname: "/course/CISC2001",
      why: `On a two-instructor course page: 'this course' reviews (ask which), then a pick by surname (open): '${gloss}'.`,
    },
    [
      [ask, CLARIFY_CISC2001],
      [choose, { navigate: "required", destination: PICKED_REVIEWS, requestedPage: "reviews" }],
    ],
  );

const missingCourse = (language: CaseLanguage, message: string, gloss = message) =>
  semanticCase(
    "unavailable",
    language,
    {
      category: "unavailable",
      intent: "unavailable-course",
      pathname: "/",
      why: `A course the site does not have: stay and say so: '${gloss}'.`,
    },
    [[message, { navigate: "unavailable", studentCodes: ["CISC9999"], requestedPage: "course" }]],
  );

const wrongInstructor = (language: CaseLanguage, message: string, gloss = message) =>
  semanticCase(
    "unavailable",
    language,
    {
      category: "unavailable",
      intent: "instructor-not-teaching",
      pathname: "/",
      why: `An instructor who never taught the course has no reviews page; open nothing in its place: '${gloss}'.`,
    },
    [[message, { navigate: "unavailable", requestedPage: "reviews" }]],
  );

export const SEMANTIC_CASES: EvalCase[] = [
  info("en", "Who's teaching CISC3014, and how many credits is it worth?"),
  info("zh-hant", "CISC3014 是哪位老師教的？有幾學分？", "Which teacher teaches CISC3014? How many credits?"),
  info("yue", "CISC3014 係邊個教㗎？幾多學分？", "Who teaches CISC3014? How many credits?"),
  info("ko", "CISC3014는 누가 가르치고 몇 학점이에요?", "Who teaches CISC3014 and how many credits is it?"),
  info("ja", "CISC3014は誰が教えていて、何単位ですか？", "Who teaches CISC3014, and how many credits is it?"),
  info("mixed-ko-en", "CISC3014 instructor 누구예요? credits도 알려 주세요", "Who's the CISC3014 instructor? Tell me the credits too"),

  open("en", "Can you pull up the CISC3014 page for me?"),
  open("zh-hant", "麻煩打開 CISC3014 的課程頁", "Please open the CISC3014 course page"),
  open("yue", "幫我轉去 CISC3014 個頁面吖", "Switch me over to the CISC3014 page"),
  open("ko", "CISC3014 페이지로 이동해 주세요", "Please move to the CISC3014 page"),
  open("ja", "CISC3014のページを開いてください", "Please open the CISC3014 page"),
  open("mixed-yue-en", "可唔可以 open 吓 CISC3014 個 page？", "Could you open the CISC3014 page?"),

  reviewsNamed("en", "Bring up the review page for Li Mei's CISC2001 class"),
  reviewsNamed("zh-hant", "我要看 LI MEI 教 CISC2001 的評價頁", "I want the reviews page for LI MEI teaching CISC2001"),
  reviewsNamed("yue", "想睇 LI MEI 教 CISC2001 嗰版評價", "Want to see the reviews page for LI MEI's CISC2001"),
  reviewsNamed("ko", "LI MEI 교수님 CISC2001 후기 페이지 열어 주세요", "Open the review page for Professor LI MEI's CISC2001"),
  reviewsNamed("ja", "LI MEI先生のCISC2001のレビューページを見せて", "Show me the review page for LI MEI's CISC2001"),
  reviewsNamed("mixed-ko-en", "CISC2001 LI MEI review page 보여줘", "Show me the CISC2001 LI MEI review page"),

  reviewsOne("en", "I want to go to CISC3014's review page"),
  reviewsOne("zh-hant", "我想去 CISC3014 的評價頁", "I want to go to the CISC3014 reviews page"),
  reviewsOne("yue", "帶我去睇 CISC3014 啲評價嗰頁", "Take me to the page with CISC3014's reviews"),
  reviewsOne("ko", "CISC3014 강의평 페이지로 데려가 주세요", "Take me to the CISC3014 course-review page"),
  reviewsOne("ja", "CISC3014の評価ページに移動したいです", "I want to move to the CISC3014 rating page"),
  reviewsOne("mixed-yue-en", "帶我去 CISC3014 嘅 review page", "Take me to CISC3014's review page"),

  reviewsMany("en", "Open the reviews page for CISC2001"),
  reviewsMany("zh-hant", "幫我打開 CISC2001 的評價頁面", "Open the CISC2001 reviews page for me"),
  reviewsMany("yue", "我想睇 CISC2001 嘅評價頁", "I want to see CISC2001's reviews page"),
  reviewsMany("ko", "CISC2001 후기 페이지 열어 줄래요?", "Will you open the CISC2001 review page?"),
  reviewsMany("ja", "CISC2001の口コミページを開いて", "Open the CISC2001 reviews page"),
  reviewsMany("mixed-ko-en", "CISC2001 review page로 가고 싶어요", "I want to go to the CISC2001 review page"),

  findOpen("en", "Is there a programming course? If there is, take me to its page."),
  findOpen("zh-hant", "有沒有程式設計的課？有的話幫我打開那門課的頁面", "Is there a programming course? If so open its page"),
  findOpen("yue", "有冇教寫程式嘅科？有就帶我去嗰科個頁", "Any course that teaches coding? If so take me to its page"),
  findOpen("ko", "프로그래밍 과목 있어요? 있으면 그 과목 페이지 열어 주세요", "Is there a programming course? If so open its page"),
  findOpen("ja", "プログラミングの授業はありますか？あればそのページを開いて", "Is there a programming class? If so open its page"),
  findOpen("mixed-yue-en", "搵吓有冇 programming 嘅 course，有就開佢個 page", "Look for a programming course and open its page if there is one"),

  hereChoose("en", ["Open this course's reviews page", "The one taught by Wong"]),
  hereChoose("zh-hant", ["打開這門課的評價頁", "Wong 老師那個"], "Open this course's reviews page / Teacher Wong's one"),
  hereChoose("yue", ["開呢科嘅評價頁", "Wong 嗰個呀"], "Open this course's reviews page / Wong's one"),
  hereChoose("ko", ["이 과목 후기 페이지로 가 주세요", "Wong 교수님 거요"], "Go to this course's review page / Professor Wong's"),
  hereChoose("ja", ["この授業のレビューページを開いて", "Wong先生のほうで"], "Open this class's review page / Wong's, please"),
  hereChoose("mixed-ko-en", ["이 course review page 열어 줘", "Wong 교수님 걸로요"], "Open this course review page / Professor Wong's"),

  wrongInstructor("en", "Open LI MEI's reviews page for CISC3014"),
  missingCourse("zh-hant", "帶我去 CISC9999 這門課", "Take me to the course CISC9999"),
  wrongInstructor("yue", "帶我去 LI MEI 教 CISC3014 嘅評價頁", "Take me to the reviews page for LI MEI teaching CISC3014"),
  missingCourse("ko", "CISC9999 과목 페이지 열어 주세요", "Open the CISC9999 course page"),
  wrongInstructor("ja", "CISC3014のLI MEI先生のレビューページを開いて", "Open LI MEI's review page for CISC3014"),
  missingCourse("mixed-yue-en", "open 吓 CISC9999 個 course page 吖", "Open the CISC9999 course page"),
];
