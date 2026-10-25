import { describe, expect, it } from "vitest";

import {
  gradeTurn,
  summarize,
  type CatalogFacts,
  type ReplyLanguage,
  type StepMetrics,
  type ToolCallRecord,
  type TurnExpectation,
  type TurnTrace,
} from "@/evals/assistant/grade";

const FACTS: CatalogFacts = {
  courseCodes: ["CISC2001", "CISC3014"],
  officialTitles: ["Programming Science", "程式設計科學", "Database Systems", "資料庫系統"],
};
const COURSE = { destination: "course", code: "CISC3014" };
const COURSE_PATH = "/course/CISC3014";

const step = (finish: string, outputTokens = 50, tools: string[] = []): StepMetrics => ({
  ms: 100,
  inputTokens: 1000,
  cachedInputTokens: 600,
  outputTokens,
  finish,
  tools,
});

function trace(overrides: Partial<TurnTrace> = {}): TurnTrace {
  return {
    caseId: "case",
    repeat: 0,
    turn: 0,
    message: "message",
    pathnameBefore: "/",
    pathnameAfter: "/",
    toolCalls: [],
    runs: [{ continuation: false, ms: 100, steps: [step("stop")] }],
    reply: "Done.",
    ms: 200,
    runCapHit: false,
    ...overrides,
  };
}

const navigateTo = (args: Record<string, unknown>, status = "navigated"): ToolCallRecord => ({
  name: "navigate",
  args,
  result: JSON.stringify({ status }),
});

const grade = (turn: TurnTrace, expectation: TurnExpectation) => gradeTurn(turn, expectation, 5, FACTS);

describe("gradeTurn navigation", () => {
  const required: TurnExpectation = { navigate: "required", destination: COURSE };

  it("passes a required navigation that lands on the expected page", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo({ destination: "course", code: "cisc3014" })], pathnameAfter: COURSE_PATH }),
      required,
    );
    expect(result).toMatchObject({ selection: "correct", navigateStatus: "navigated", landed: true, pass: true });
  });

  it("accepts already_here when the student is on the page already", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo(COURSE, "already_here")], pathnameBefore: COURSE_PATH, pathnameAfter: COURSE_PATH }),
      required,
    );
    expect(result).toMatchObject({ selection: "correct", navigateStatus: "already_here", landed: true, pass: true });
  });

  it("does not complete the task when the page was not found", () => {
    const result = grade(trace({ toolCalls: [navigateTo(COURSE, "not_found")] }), required);
    expect(result).toMatchObject({ selection: "correct", navigateStatus: "not_found", landed: false, pass: false });
  });

  it("treats arguments the navigate tool rejects as a selection failure, not a wrong page", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo({ destination: "reviews", code: "CISC3014" }, "invalid_destination")] }),
      { navigate: "required", destination: { destination: "reviews", code: "CISC3014", instructor: "CHAN TAI MAN" } },
    );
    expect(result).toMatchObject({
      selection: "invalid_arguments",
      navigateStatus: "invalid_destination",
      landed: false,
      pass: false,
    });
  });

  it("does not count a timeout as landing, even on the expected path", () => {
    const result = grade(trace({ toolCalls: [navigateTo(COURSE, "timeout")], pathnameAfter: COURSE_PATH }), required);
    expect(result).toMatchObject({ selection: "correct", navigateStatus: "timeout", landed: false, pass: false });
  });

  it("does not count a navigation that ended on another path", () => {
    const wrongPath = grade(trace({ toolCalls: [navigateTo(COURSE)], pathnameAfter: "/course/CISC2001" }), required);
    const elsewhere = grade(trace({ toolCalls: [navigateTo(COURSE, "landed_elsewhere")], pathnameAfter: "/" }), required);
    expect(wrongPath).toMatchObject({ selection: "correct", navigateStatus: "navigated", landed: false, pass: false });
    expect(elsewhere).toMatchObject({ selection: "correct", navigateStatus: "landed_elsewhere", landed: false, pass: false });
  });

  it("does not count a navigate call that never got a result", () => {
    const result = grade(trace({ toolCalls: [{ name: "navigate", args: COURSE }], runCapHit: true }), required);
    expect(result).toMatchObject({ selection: "correct", navigateStatus: null, landed: false, pass: false });
  });

  it("credits a retry that lands for completion but not for tool selection", () => {
    const result = grade(
      trace({
        toolCalls: [navigateTo({ destination: "course", code: "nope" }, "invalid_destination"), navigateTo(COURSE)],
        pathnameAfter: COURSE_PATH,
      }),
      required,
    );
    expect(result).toMatchObject({ selection: "invalid_arguments", navigateStatus: "invalid_destination", landed: true, pass: true });
  });

  it("flags navigation to the wrong page", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo({ destination: "course", code: "CISC2001" })], pathnameAfter: "/course/CISC2001" }),
      required,
    );
    expect(result).toMatchObject({ selection: "wrong_destination", landed: false, pass: false });
  });

  it("reports a missed navigation as an omission when nothing stopped the model", () => {
    const result = grade(trace(), required);
    expect(result).toMatchObject({ selection: "missed", navigateStatus: null, landed: false, pass: false });
    expect(result.limits.omission).toBe(true);
  });

  it("does not call a navigation cut off by maxSteps an omission", () => {
    const steps = [1, 2, 3, 4, 5].map(() => step("tool-calls", 30, ["get_course"]));
    const result = grade(trace({ runs: [{ continuation: false, ms: 500, steps }] }), required);
    expect(result.limits.maxStepsHit).toBe(true);
    expect(result.limits.omission).toBe(false);
  });

  it("flags navigation during an information question", () => {
    const expectation: TurnExpectation = { navigate: "forbidden", tools: [{ name: "get_course", args: { code: "CISC3014" } }] };
    const result = grade(
      trace({
        toolCalls: [{ name: "get_course", args: { code: "CISC3014" } }, navigateTo({ destination: "timetable" })],
        pathnameAfter: "/timetable",
      }),
      expectation,
    );
    expect(result).toMatchObject({ selection: "unsolicited", academicTools: true, landed: null, pass: false });
  });

  it("requires the academic tools only when an optional turn did not navigate", () => {
    const expectation: TurnExpectation = {
      navigate: "optional",
      destination: COURSE,
      tools: [{ name: "get_course", args: { code: "CISC3014" } }],
    };
    const skipped = grade(trace(), expectation);
    const taken = grade(trace({ toolCalls: [navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), expectation);
    const wrongPage = grade(
      trace({ toolCalls: [navigateTo({ destination: "course", code: "CISC2001" })], pathnameAfter: "/course/CISC2001" }),
      expectation,
    );
    expect(skipped).toMatchObject({ selection: "optional_skipped", academicTools: false, landed: null, pass: false });
    expect(taken).toMatchObject({ selection: "optional_taken", academicTools: null, landed: true, pass: true });
    expect(wrongPage).toMatchObject({ selection: "wrong_destination", landed: false, pass: false });
  });

  it("completes a compound request only when the lookup comes before a navigate call that lands", () => {
    const expectation: TurnExpectation = {
      navigate: "required",
      destination: COURSE,
      tools: [{ name: "search_catalog", args: { type: "course" } }],
    };
    const search = { name: "search_catalog", args: { type: "course", query: "database" } };
    const inOrder = grade(trace({ toolCalls: [search, navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), expectation);
    const reversed = grade(trace({ toolCalls: [navigateTo(COURSE), search], pathnameAfter: COURSE_PATH }), expectation);
    const notFound = grade(trace({ toolCalls: [search, navigateTo(COURSE, "not_found")] }), expectation);
    expect(inOrder).toMatchObject({ compound: true, pass: true });
    expect(reversed).toMatchObject({ compound: false, pass: false });
    expect(notFound).toMatchObject({ compound: false, pass: false });
  });
});

describe("gradeTurn replies", () => {
  it("checks the reply: required mentions, unknown course codes, language and truncation", () => {
    const expectation: TurnExpectation = {
      navigate: "forbidden",
      mustMention: [["Database Systems", "資料庫系統"]],
      replyLanguage: "chinese",
    };
    const result = grade(
      trace({ reply: "See ABCD1234.", runs: [{ continuation: false, ms: 100, steps: [step("length", 400)] }] }),
      expectation,
    );
    expect(result.responseProblems).toEqual([
      "finish: length",
      "missing: Database Systems | 資料庫系統",
      "unknown course codes: ABCD1234",
      "reply is not in Chinese",
    ]);
    expect(result.limits).toMatchObject({ truncated: true, maxStepOutputTokens: 400 });
  });
});

describe("summarize", () => {
  it("separates tool selection, simulated navigation and task completion", () => {
    const required: TurnExpectation = { navigate: "required", destination: COURSE };
    const forbidden: TurnExpectation = { navigate: "forbidden" };
    const grades = [
      grade(trace({ ms: 1000, toolCalls: [navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), required),
      grade(trace({ ms: 3000, toolCalls: [navigateTo(COURSE, "not_found")] }), required),
      grade(trace({ ms: 4000 }), required),
      grade(trace({ ms: 2000, toolCalls: [navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), forbidden),
    ];

    const summary = summarize(grades);

    expect(summary.turns).toBe(4);
    expect(summary.passed).toBe(1);
    expect(summary.toolSelection).toEqual({
      required: 3,
      correct: 2,
      missed: 1,
      invalidArguments: 0,
      wrongDestination: 0,
      omissions: 1,
    });
    expect(summary.simulatedNavigation).toEqual({
      required: 3,
      landed: 1,
      statuses: { navigated: 1, not_found: 1, no_call: 1 },
    });
    expect(summary.unsolicited).toEqual({ forbidden: 1, navigated: 1 });
    expect(summary.limits).toMatchObject({ runs: 4, steps: 4, latencyP50Ms: 3000, finishCounts: { stop: 4 }, inputTokens: 4000 });
    expect(summary.byTurn).toEqual({ "case#1": { passed: 1, total: 4 } });
  });
});

describe("gradeTurn reply language", () => {
  const english: TurnExpectation = { navigate: "forbidden", replyLanguage: "english" };
  const chinese: TurnExpectation = { navigate: "forbidden", replyLanguage: "chinese" };
  const check = (reply: string, expectation: TurnExpectation) => {
    const result = grade(trace({ reply }), expectation);
    return { languageOk: result.languageOk, problems: result.responseProblems };
  };

  it("allows an official catalog title inside an English reply", () => {
    expect(check("**CISC3014 – Database Systems（資料庫系統）** — 3 credits, taught in English.", english)).toEqual({
      languageOk: true,
      problems: [],
    });
  });

  it("still flags Chinese prose in an English reply", () => {
    expect(check("已为你打开 CISC3014 的课程页面。", english)).toEqual({
      languageOk: false,
      problems: ["reply contains Chinese"],
    });
    expect(check("CISC3014 資料庫系統, 3 学分.", english).languageOk).toBe(false);
  });

  it("only exempts titles exactly as the catalog stores them", () => {
    expect(check("CISC3014 (资料库系统) covers SQL.", english).languageOk).toBe(false);
    expect(check("CISC3014 (資料庫) covers SQL.", english).languageOk).toBe(false);
  });

  it("does not let a quoted title make an English reply count as Chinese", () => {
    expect(check("CISC3014 is 資料庫系統, 3 credits.", chinese)).toEqual({
      languageOk: false,
      problems: ["reply is not in Chinese"],
    });
    expect(check("CISC3014 資料庫系統：3 學分，以英文授課。", chinese)).toEqual({ languageOk: true, problems: [] });
  });

  it("leaves languageOk unset when the turn has no language expectation", () => {
    expect(grade(trace({ reply: "Done." }), { navigate: "forbidden" }).languageOk).toBeNull();
  });

  it("counts language checks in the summary", () => {
    const grades = [
      grade(trace({ reply: "Database Systems（資料庫系統）" }), english),
      grade(trace({ reply: "已打开。" }), english),
      grade(trace({ reply: "Done." }), { navigate: "forbidden" }),
    ];
    expect(summarize(grades).language).toEqual({ checked: 2, ok: 1 });
  });
});

describe("gradeTurn Korean and Japanese replies", () => {
  const problems = (reply: string, language: ReplyLanguage) =>
    grade(trace({ reply }), { navigate: "forbidden", replyLanguage: language }).responseProblems;

  it("accepts Korean and Japanese replies that name the course", () => {
    expect(problems("CISC3014 (Database Systems)는 데이터베이스를 배우는 3학점 과목입니다.", "korean")).toEqual([]);
    expect(problems("CISC3014「資料庫系統」はデータベースの授業です。", "japanese")).toEqual([]);
  });

  it("tells Japanese from Chinese by kana", () => {
    expect(problems("CISC3014 是資料庫系統課程。", "japanese")).toEqual(["reply is not in Japanese"]);
    expect(problems("CISC3014はデータベースの授業です。", "chinese")).toEqual(["reply contains Japanese"]);
  });

  it("flags a reply in the wrong language for Korean and English students", () => {
    expect(problems("CISC3014 covers SQL.", "korean")).toEqual(["reply is not in Korean"]);
    expect(problems("CISC3014 데이터베이스", "english")).toEqual(["reply contains Korean"]);
  });
});

describe("gradeTurn unavailable pages", () => {
  const unavailable: TurnExpectation = { navigate: "unavailable", studentCodes: ["CISC9999"] };

  it("passes when navigate reports not_found and the student stays", () => {
    const result = grade(
      trace({
        toolCalls: [navigateTo({ destination: "course", code: "CISC9999" }, "not_found")],
        reply: "CISC9999 is not on this site.",
      }),
      unavailable,
    );
    expect(result).toMatchObject({ selection: "attempted", stayed: true, intentOk: true, pass: true, responseProblems: [] });
  });

  it("passes when the assistant explains without calling navigate", () => {
    expect(grade(trace({ reply: "There is no CISC9999 on this site." }), unavailable)).toMatchObject({
      selection: "none",
      stayed: true,
      pass: true,
    });
  });

  it("fails when the student ends up on another page", () => {
    const result = grade(trace({ toolCalls: [navigateTo({ destination: "catalog" })], pathnameAfter: "/catalog" }), unavailable);
    expect(result).toMatchObject({ stayed: false, intentOk: false, pass: false });
  });

  it("still flags course codes the student did not type", () => {
    expect(grade(trace({ reply: "Try CISC9998 instead." }), unavailable).responseProblems).toEqual([
      "unknown course codes: CISC9998",
    ]);
  });
});

describe("gradeTurn intent", () => {
  it("credits the right decision even when the page did not load", () => {
    const result = grade(trace({ toolCalls: [navigateTo({ destination: "course", code: "CISC3014" }, "timeout")] }), {
      navigate: "required",
      destination: COURSE,
    });
    expect(result).toMatchObject({ selection: "correct", intentOk: true, landed: false, pass: false });
  });

  it("does not credit a question answered by opening a page", () => {
    const result = grade(
      trace({ toolCalls: [navigateTo({ destination: "course", code: "CISC3014" })], pathnameAfter: COURSE_PATH }),
      { navigate: "forbidden" },
    );
    expect(result.intentOk).toBe(false);
  });

  it("needs the lookups as well as the navigation decision", () => {
    expect(grade(trace(), { navigate: "forbidden", tools: [{ name: "get_course", args: { code: "CISC3014" } }] }).intentOk).toBe(
      false,
    );
  });
});

describe("summarize Phase 2 fields", () => {
  it("summarises intent, unavailable pages, reasoning tokens and latency", () => {
    const thinkingStep: StepMetrics = { ...step("stop", 300), reasoningTokens: 200, ms: 4000 };
    const grades = [
      grade(trace({ runs: [{ continuation: false, ms: 4000, steps: [step("tool-calls"), thinkingStep] }], ms: 5000 }), {
        navigate: "forbidden",
      }),
      grade(trace({ ms: 1000 }), { navigate: "unavailable" }),
    ];
    expect(summarize(grades)).toMatchObject({
      intent: { turns: 2, ok: 2 },
      unavailable: { turns: 1, stayed: 1, attempted: 0 },
      limits: { reasoningTokens: 200, maxStepMs: 4000, stepsPerTurnMean: 1.5, latencyP95Ms: 5000 },
    });
  });
});

describe("gradeTurn clarify turns", () => {
  const clarify: TurnExpectation = {
    navigate: "clarify",
    tools: [{ name: "get_course", args: { code: "CISC2001" } }],
    options: ["WONG KA KI", "LI MEI"],
    requestedPage: "reviews",
  };
  const lookup: ToolCallRecord = { name: "get_course", args: { code: "CISC2001" } };
  const NAMED: CatalogFacts = { ...FACTS, instructorNames: ["WONG KA KI", "LI MEI", "CHAN TAI MAN"] };
  const gradeClarify = (turn: TurnTrace) => gradeTurn(turn, clarify, 5, NAMED);

  it("passes a lookup, every option and a question, without navigating", () => {
    const result = gradeClarify(
      trace({ toolCalls: [lookup], reply: "CISC2001 has two instructors: WONG KA KI and Li Mei. Which reviews page do you want?" }),
    );
    expect(result).toMatchObject({
      selection: "none",
      premature: false,
      substituted: false,
      strayed: false,
      intentOk: true,
      pass: true,
      clarification: { detected: true, lookedUp: true, optionsNamed: 2, options: 2, invented: [], complete: true },
    });
  });

  it("accepts a full-width question mark", () => {
    expect(gradeClarify(trace({ toolCalls: [lookup], reply: "WONG KA KI 定 LI MEI？" })).clarification?.detected).toBe(true);
  });

  it("counts any navigate call as premature, and the course page as a substitute", () => {
    const result = gradeClarify(
      trace({
        toolCalls: [lookup, navigateTo({ destination: "course", code: "CISC2001" })],
        pathnameAfter: "/course/CISC2001",
        reply: "Opened CISC2001. WONG KA KI or LI MEI?",
      }),
    );
    expect(result).toMatchObject({
      selection: "premature",
      premature: true,
      substituted: true,
      strayed: true,
      intentOk: false,
      pass: false,
      clarification: { detected: false, complete: false },
    });
  });

  it("does not credit a reply that picks one instructor or names one from another course", () => {
    const picked = gradeClarify(trace({ toolCalls: [lookup], reply: "LI MEI teaches CISC2001. Want her reviews?" }));
    const invented = gradeClarify(trace({ toolCalls: [lookup], reply: "WONG KA KI, LI MEI or CHAN TAI MAN?" }));
    expect(picked).toMatchObject({ clarification: { detected: true, optionsNamed: 1, complete: false }, pass: false });
    expect(invented).toMatchObject({ clarification: { invented: ["CHAN TAI MAN"], complete: false }, pass: false });
  });

  it("needs the lookup and a question", () => {
    const noLookup = gradeClarify(trace({ reply: "WONG KA KI or LI MEI?" }));
    const noQuestion = gradeClarify(trace({ toolCalls: [lookup], reply: "CISC2001 is taught by WONG KA KI and LI MEI." }));
    expect(noLookup).toMatchObject({ clarification: { lookedUp: false, complete: false }, intentOk: false, pass: false });
    expect(noQuestion).toMatchObject({ clarification: { detected: false, complete: false }, pass: false });
  });
});

describe("gradeTurn premature, substituted and stray navigation", () => {
  const REVIEWS = { destination: "reviews", code: "CISC3014", instructor: "CHAN TAI MAN" };
  const REVIEWS_PATH = "/reviews/CISC3014/CHAN%20TAI%20MAN";
  const lookup: ToolCallRecord = { name: "get_course", args: { code: "CISC3014" } };
  const lookupFirst: TurnExpectation = {
    navigate: "required",
    destination: REVIEWS,
    tools: [{ name: "get_course", args: { code: "CISC3014" } }],
    requestedPage: "reviews",
  };

  it("flags a navigate call made before the lookup it needed, without changing completion", () => {
    const guessed = grade(
      trace({
        toolCalls: [navigateTo({ destination: "reviews", code: "CISC3014", instructor: "CHAN" }, "not_found"), lookup, navigateTo(REVIEWS)],
        pathnameAfter: REVIEWS_PATH,
      }),
      lookupFirst,
    );
    const inOrder = grade(trace({ toolCalls: [lookup, navigateTo(REVIEWS)], pathnameAfter: REVIEWS_PATH }), lookupFirst);
    expect(guessed).toMatchObject({ premature: true, substituted: false, strayed: false, pass: true });
    expect(inOrder).toMatchObject({ premature: false, substituted: false, strayed: false, pass: true });
  });

  it("fails a turn that opened another page type instead of the requested one", () => {
    const result = grade(
      trace({ toolCalls: [lookup, navigateTo({ destination: "course", code: "CISC3014" })], pathnameAfter: "/course/CISC3014" }),
      lookupFirst,
    );
    expect(result).toMatchObject({ selection: "wrong_destination", substituted: true, strayed: true, pass: false });
  });

  it("leaves premature, substituted and clarification unset when the case does not define them", () => {
    const result = grade(trace({ toolCalls: [navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), {
      navigate: "required",
      destination: COURSE,
    });
    expect(result).toMatchObject({ premature: null, substituted: null, strayed: false, clarification: null });
  });

  it("counts an unsolicited landing as straying, but not already_here", () => {
    const moved = grade(trace({ toolCalls: [navigateTo(COURSE)], pathnameAfter: COURSE_PATH }), { navigate: "forbidden" });
    const stayed = grade(
      trace({ toolCalls: [navigateTo(COURSE, "already_here")], pathnameBefore: COURSE_PATH, pathnameAfter: COURSE_PATH }),
      { navigate: "forbidden" },
    );
    expect(moved.strayed).toBe(true);
    expect(stayed.strayed).toBe(false);
  });
});

describe("summarize semantic-action fields", () => {
  it("counts clarify turns, premature, substituted and stray navigation", () => {
    const clarify: TurnExpectation = { navigate: "clarify", options: ["WONG KA KI", "LI MEI"], requestedPage: "reviews" };
    const grades = [
      grade(trace({ reply: "WONG KA KI or LI MEI?" }), clarify),
      grade(
        trace({ toolCalls: [navigateTo({ destination: "course", code: "CISC2001" })], pathnameAfter: "/course/CISC2001" }),
        clarify,
      ),
      grade(trace(), { navigate: "forbidden" }),
    ];
    expect(summarize(grades)).toMatchObject({
      clarification: { turns: 2, detected: 1, complete: 1 },
      premature: { checked: 2, navigated: 1 },
      substituted: { checked: 2, navigated: 1 },
      strayed: { turns: 3, count: 1 },
    });
  });
});
