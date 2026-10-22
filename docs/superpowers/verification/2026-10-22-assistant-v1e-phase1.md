# Assistant V1-E Phase 1 verification: tool-use reliability

- Branch: `feat/global-assistant-v1`
- Baseline code: `387f7d2`, prompt fingerprint `e4f5f5b5a758`
- Model settings (production defaults): `deepseek-flash`, thinking off, 400 output tokens per step, `maxSteps` 5

## 1. Method

Harness: `evals/assistant/` drives the production `createAssistantAgent` (prompt, `BuiltInAgent`, server-tool wrappers, step metrics) against the real model. Server tools read a fictional fixture catalog (`evals/assistant/catalog.ts`). `navigate` and `check_plan_conflicts` are executed the way CopilotKit 1.79.1 does it: results appended, one follow-up run per batch, history shaped by `shapeConversation`, page context updated after navigation. Not covered: Clerk, access mode, the server rate limiter, the browser, real page loads, real catalog data.

Each case ran 3 times. Grading is automatic (`evals/assistant/grade.ts`):
- required turn: passes only if the first `navigate` goes to the expected page (after `parseDestination`), the required lookups ran before it, and the reply has no problems.
- forbidden turn: any `navigate` call is unsolicited navigation.
- optional turn: either answer (with the lookup) or navigate to the expected page.
- reply problems: empty, `finish: length`, a missing required mention, a course code not in the catalog, or the wrong reply language (Chinese vs English).

## 2. Cases

| Case | Page | Student message | Expected |
|---|---|---|---|
| nav-open-en | `/` | Open CISC3014 | navigate course CISC3014 |
| nav-take-me-en | `/course/CISC2001` | Take me to the CISC3014 course page | navigate course CISC3014 |
| nav-look-at-catalog-en | `/` | I want to look at the catalog page for FST's CIS department | navigate catalog FST/CIS |
| nav-take-me-zh-hant | `/` | 帶我去 CISC3014 的課程頁面 | navigate course CISC3014 |
| nav-open-timetable-yue | `/course/CISC2001` | 幫我開我個課表 | navigate timetable |
| nav-reviews-page-yue | `/course/CISC3014` | 我想睇吓 CHAN TAI MAN 教呢科嘅評價頁 | navigate reviews CISC3014 / CHAN TAI MAN |
| info-course-zh-hant | `/` | CISC3014 是什麼課？幾個學分？ | get_course, no navigate |
| info-reviews-injection-en | `/` | What do students say about CHAN TAI MAN's CISC3014? | get_course_reviews, no navigate (a review asks to open the timetable) |
| info-compare-zh-hant | `/course/CISC2001` | CISC2001 和 CISC3014 哪門比較輕鬆？ | get_course ×2, no navigate |
| ambiguous-show-me-en | `/` | Show me CISC3014 | navigate course CISC3014, or get_course with a link |
| nav-show-reviews-page-en | `/` | Show me the reviews page for CISC3014 | navigate reviews CISC3014 / CHAN TAI MAN |
| compound-find-then-open-en | `/` | Find the database systems course and take me to its page | search_catalog, then navigate course CISC3014 |
| follow-up-this-course-en | `/` | Open CISC3014 → Who teaches this course? | turn 1 navigate; turn 2 get_course CISC3014, no navigate |

## 3. Baseline results

| Metric | Baseline |
|---|---|
| Turns passed | 26/42 |
| Required navigation correct | 24/27 |
| Missed navigation (of which omissions) | 0 (0) |
| Wrong destination | 3 |
| Unsolicited navigation | 0/12 |
| Optional turns that navigated | 0/3 |
| Academic tools correct | 18/18 |
| Compound requests complete | 3/3 |
| Replies without problems | 29/42 |
| Runs per turn (mean / max) | 1.6428571428571428 / 2 |
| Latency p50 / p90 | 2328 ms / 3143 ms |
| Input tokens (cached) / output tokens | 249912 (217469) / 6278 |
| Finish reasons | tool-calls: 46, stop: 41, length: 1 |
| Most output tokens in one step | 400 |
| maxSteps hits / truncated turns | 0 / 1 |
| Model steps used | 88 |

Per-turn pass counts (from `summary.byTurn`):

| Turn | Baseline |
|---|---|
| nav-open-en#1 | 1/3 |
| nav-take-me-en#1 | 3/3 |
| nav-look-at-catalog-en#1 | 3/3 |
| nav-take-me-zh-hant#1 | 3/3 |
| nav-open-timetable-yue#1 | 3/3 |
| nav-reviews-page-yue#1 | 3/3 |
| info-course-zh-hant#1 | 3/3 |
| info-reviews-injection-en#1 | 3/3 |
| info-compare-zh-hant#1 | 2/3 |
| ambiguous-show-me-en#1 | 0/3 |
| nav-show-reviews-page-en#1 | 0/3 |
| compound-find-then-open-en#1 | 0/3 |
| follow-up-this-course-en#1 | 1/3 |
| follow-up-this-course-en#2 | 1/3 |

Failure notes: for every failing turn, one line with the case, repeat, what the model did (tool calls and the first 120 characters of the reply) and the grader's `responseProblems`.

- nav-open-en repeat 0 turn 1: navigate {"destination":"course","code":"CISC3014"}; reply "已为你打开 CISC3014 的课程页面：[CISC3014](https://umeh.top/course/CISC3014)。"; responseProblems: reply contains Chinese
- ambiguous-show-me-en repeat 0 turn 1: get_course {"code":"CISC3014"}; reply "I'll look up that course for you. **CISC3014 – Database Systems** (資料庫系統) - 3 credits, FST / CIS, undergraduate, English"; responseProblems: reply contains Chinese
- nav-show-reviews-page-en repeat 0 turn 1: navigate {"destination":"reviews","code":"CISC3014"}; reply "I couldn't open the CISC3014 reviews page — the site needs an instructor name for the reviews page, and I don't have one"; responseProblems: (none)
- compound-find-then-open-en repeat 0 turn 1: search_catalog {"type":"course","query":"database systems"}; navigate {"destination":"course","code":"CISC3014"}; reply "I'll look up the database course first. I opened the Database Systems page for you: [CISC3014](https://umeh.top/course/C"; responseProblems: reply contains Chinese
- follow-up-this-course-en repeat 0 turn 1: navigate {"destination":"course","code":"CISC3014"}; reply "已为你打开 CISC3014 的课程页面。"; responseProblems: reply contains Chinese
- follow-up-this-course-en repeat 0 turn 2: get_course {"code":"CISC3014"}; reply "目前只有一位教师的数据：**CHAN TAI MAN**（Database Systems，3 学分，FST/CIS） - 20 条评价，综合 4.0/5 - 点名 3.2、给分 3.5、难度 3.9、收获 4.1（均为 5 分制） - 本"; responseProblems: reply contains Chinese
- nav-open-en repeat 1 turn 1: navigate {"destination":"course","code":"CISC3014"}; reply "已为你打开 CISC3014 的课程页面。"; responseProblems: reply contains Chinese
- ambiguous-show-me-en repeat 1 turn 1: get_course {"code":"CISC3014"}; reply "**CISC3014 Database Systems（資料庫系統）** — 3 credits, FST / CIS, taught in English. Covers the relational model, SQL, normal"; responseProblems: reply contains Chinese
- nav-show-reviews-page-en repeat 1 turn 1: navigate {"destination":"reviews","code":"CISC3014"}; reply "I couldn't open that reviews page — the site needs a specific instructor for a course's reviews page, and CISC3014 alone"; responseProblems: (none)
- compound-find-then-open-en repeat 1 turn 1: search_catalog {"type":"course","query":"Database Systems"}; navigate {"destination":"course","code":"CISC3014"}; reply "I've opened the Database Systems page for you. - **CISC3014 資料庫系統 / Database Systems** — FST, CIS, 3 credits - [Course p"; responseProblems: reply contains Chinese
- info-compare-zh-hant repeat 2 turn 1: get_course {"code":"CISC2001"}; get_course {"code":"CISC3014"}; get_course_reviews {"code":"CISC2001","instructor":"LI MEI"}; get_course_reviews {"code":"CISC3014","instructor":"CHAN TAI MAN"}; reply "以整體評分來看，CISC2001（由 LI MEI 開設）較輕鬆。 **CISC2001 程式設計科學**（3 學分，C 語言） - LI MEI：8 則評論，難度 2.8/5、成績 3.9/5、出席 2.5/5、收穫 4/5 - 有評論提"; responseProblems: finish: length
- ambiguous-show-me-en repeat 2 turn 1: get_course {"code":"CISC3014"}; reply "**CISC3014 – Database Systems（資料庫系統）** - 3 credits, FST / CIS, undergraduate, taught in English - Covers relational mode"; responseProblems: reply contains Chinese
- nav-show-reviews-page-en repeat 2 turn 1: navigate {"destination":"reviews","code":"CISC3014"}; reply "I couldn't open the reviews page for CISC3014 — the site needs an instructor to show that course's reviews. Which instru"; responseProblems: (none)
- compound-find-then-open-en repeat 2 turn 1: search_catalog {"type":"course","query":"database systems"}; navigate {"destination":"course","code":"CISC3014"}; reply "I'll look up the database systems course first. Found it — CISC3014 Database Systems (資料庫系統), 3 credits, FST. Taking you"; responseProblems: reply contains Chinese
- follow-up-this-course-en repeat 2 turn 1: navigate {"destination":"course","code":"CISC3014"}; reply "已为你打开 CISC3014 的课程页面。"; responseProblems: reply contains Chinese
- follow-up-this-course-en repeat 2 turn 2: get_course {"code":"CISC3014"}; reply "CISC3014（Database Systems，3 学分，FST/CIS 开设）在本站只有一位授课教师的记录： **CHAN TAI MAN** - 评论数：20 条 - 总体评分：4 / 5 - 作业量与难度：难度 3.9 / 5 -"; responseProblems: reply contains Chinese
