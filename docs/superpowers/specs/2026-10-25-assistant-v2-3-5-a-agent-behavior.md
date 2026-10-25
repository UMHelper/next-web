# What2Reg AI V2.3.5-A: Agent Behavior & Truthfulness (spec record)

**Status:** Requirements fixed by the product brief of 2026-10-25. This file records the brief and the policy decisions taken during repository discovery, so plan executors can read both.
**Source of truth:** the V2.3.5-A brief (conversation of 2026-10-25) and `docs/superpowers/audits/2026-10-25-what2reg-ai-v2-3-5-discovery-audit.md` (sections 5, 6.4, 7, 8, 9, 13, 16, 17, 18).
**Branch / base:** `feat/global-assistant-v2` @ `6c956a7`.

## 1. Goal

Turn What2Reg AI from an overly procedural academic chatbot into a natural, context-aware academic planning assistant.

> Conversation first. Rich UI when it genuinely adds value.

Neither "always display cards" nor "display cards only after explicit trigger phrases". A student saying "I'm thinking of taking this course. Is it worth it?" gets grounded academic guidance, with a course card when it helps, without typing "show course card". "How many credits is X?" still gets a concise answer.

## 2. Workstreams (in scope)

| ID | Workstream | Outcome |
|---|---|---|
| A1 | Prompt architecture cleanup | Compact, principle-based core prompt; procedures move to tool descriptions or deterministic code |
| A2 | Intent-aware academic assistance | Course evaluation, instructor comparison, follow-ups, preferences, alternatives, timetable fit with existing tools |
| A3 | Adaptive presentation contract | Course-detail and section cards: natural, validated, deduplicated, truthful |
| A4 | Tool error honesty | Data / empty / not found / invalid / temporary failure / incomplete / unsupported are distinguishable |
| A5 | Essential academic correctness | Difficulty direction, review counts and sample size, unsupported academic information |
| A6 | Regression and acceptance | Unit, scripted CopilotKit integration, student journeys, live DeepSeek eval, browser acceptance |

## 3. Out of scope

Persistent conversations; database-backed history; planning-preferences ledger; new bulk constraint-aware discovery; new recommendation or optimization engine; admin quota system; rate-limit accounting changes; new model provider; new UI component framework; planner mutations; official registration; degree auditing; V3 timetable generation; V2.3.5-B/C/D/E; V2.4; V3.

## 4. Required intents (semantic behavior, not phrases)

| Intent | Example | Expected |
|---|---|---|
| Quick fact | "How many credits is GEST1004?" | Concise answer, no card |
| Course exploration | "I'm considering taking GEST1004. Is it difficult?" | Course + difficulty information grounded in rating semantics and sample size; a detail card may appear |
| Deeper investigation | "Tell me more about GELH1000." | Substantive exploration and a course-detail card; no magic phrase |
| Instructor comparison | "Which professor would you recommend for GELH1000?" | Compare offered instructors by ratings, review counts, review evidence; no stacked detail cards |
| Academic preference | "I don't want a midterm." | Applied to later questions while it remains in the conversation; no claim of durable memory |
| Alternatives | "Can you suggest alternatives?" | Relative to the preceding course, subject area and objective; not unrelated departments |
| Timetable fit | "Will this course fit my timetable?" | Correct course; existing deterministic timetable tools; no overlap computed by the model |

Adaptive presentation table (semantic examples, test with paraphrases):

| Request | Expected |
|---|---|
| "What is GEST1004?" | Concise explanation |
| "I'm considering GEST1004" | Useful evaluation, optionally one detail card |
| "Tell me more about GEST1004" | Course detail card |
| "How many credits?" | Text only |
| "Which professor is easier?" | Comparison grounded in ratings/reviews |
| "Show available sections" | Section cards |
| "When is section 001?" | Text first |
| "Show my timetable" | Existing timetable preview |
| "Would it conflict?" | Existing deterministic clash result |
| "Compare two courses" | Compact comparison, not stacked detail cards |

## 5. Presentation invariants (A3)

1. No course-detail card without matching validated course data.
2. No section card without matching validated section data.
3. No invented course identity or section schedule.
4. No duplicate cards for the same logical course unless justified.
5. No automatic card flood from ordinary lookup questions.
6. No false claim that a card was displayed when rendering was not confirmed.
7. Historical or previous-turn course inspection works coherently.
8. Search lists remain interactive.
9. Timetable previews preserve V2.3 behavior.
10. Compatible with future conversation persistence.

A server-side presentation action cannot prove a browser component mounted. Do not return or interpret `accepted` as proof of rendering. Do not invent a synchronous browser render acknowledgement.

## 6. Error honesty (A4)

Distinguish: success with data; success empty; course/section not found; invalid request; temporary provider/database failure; incomplete or truncated data; unsupported academic information. One search failing while another succeeds must not become "no matching courses". A failed review lookup must not become "no reviews". Incomplete section data must not support a definitive conflict-free statement. No stack traces or infrastructure details reach students. Public MCP surface stays compatible (additive or assistant-only changes).

## 7. Academic correctness (A5)

- Difficulty: 1 = Very hard, 5 = Very easy. Higher difficulty number = easier. Never reversed. Stored ratings are not migrated or inverted.
- Scale direction is explicit in tool data used for decisions; comparisons include review count; tiny samples do not support strong conclusions.
- The platform has no authoritative data for midterms/finals, prerequisites, seat availability, some workload attributes. Distinguish verified structured facts, review-reported experiences, assistant interpretation, unknown. No fabricated exam-format field.

Acceptable: "Several student reviews mention no midterm, but this is not verified as the current assessment arrangement." Not acceptable without authoritative data: "This course definitely has no midterm."

## 8. Responsibility split (avoid another rigid agent)

Deterministic code: authentication, authorization, valid academic identities, read-only permissions, verified data normalization, timetable calculations, rating scale semantics, tool-result validation, presentation data eligibility, bounded resources.

Model: understanding objectives, choosing tools, how much explanation helps, weighing evidence, trade-offs, conditional recommendations, when optional rich content is useful.

No deterministic keyword intent classifier. No persistent planning ledger.

## 9. Policy decisions taken at discovery (2026-10-25)

| ID | Decision | Replaces |
|---|---|---|
| D1 Review evidence | Verified aggregate ratings suffice to describe ratings. Read reviews before claims about teaching quality, workload, grading, assessment or classroom experience, and before recommending one option over another. No review read for simple catalog facts. No unsupported claims when review evidence is absent. | Prompt rule 18 + rule 26 three-tool batch + "do not call get_course_reviews unless asked" (audit C1, C2) |
| D2 Context precedence | Fresh academic tool results for academic facts; planner digest for saved timetable facts; matching preview context for hypothetical questions; conversation history for goals, preferences, continuity; validated referents for identity. Earlier assistant prose never outranks refreshed data. | Rule 3 "answer only from this turn's tool results" (C3) |
| D3 Tool outcomes | Typed outcomes with fixed meanings; no "failure means no data" instruction. | Rule 3 failure wording (C4) |
| D4 Presentation | Model states intent with `present_response` (course_detail / course_sections) when a card helps; comparison = prose/table; timetable = `preview_timetable`. Server returns a per-item eligibility receipt (`ready` / `missing_lookup` / `lookup_failed`), status `requested`, never `accepted`. Client planner owns mounting and logical dedupe. Client publishes a visible-blocks context so later turns know what was actually displayed. Successful unclaimed lookups get a compact "show card" affordance. | Phrase gates in rule 11, rule 15 and the `present_response` description (C5, C6, C8) |
| D5 Panel width | "Narrow, resizable side panel"; no pixel width in the prompt. | "about 380px" (C7) |
| D6 Difficulty filter | Assistant-only `get_instructor` uses `minEase` (keeps `hard >= value`) and sort key `ease`; MCP public tool unchanged. | `maxDifficulty` (`hard <= value`) trap (audit 8.2) |
| D7 Zero aggregates | In assistant projections a rating of 0 or a row with 0 reviews is `null` (no measured value; scales start at 1). | Coalesced zeros read as scores (audit 8.1) |
| D8 Data gaps | `get_course` assistant output lists data the site does not have (`notAvailableOnSite`). No exam-format field. | Implicit gaps (P1-07) |
| D9 Shared helpers | `get-course-info.ts` has an uncommitted pre-existing change (course_catalog → course_noporf fallback). It is not modified in this milestone; get_course outage-vs-not-found stays a documented limitation. | n/a |

## 10. Acceptance criteria (verbatim from the brief)

- [ ] The system prompt no longer contains the identified review/context/presentation contradictions.
- [ ] The prompt is materially simpler and focused on academic assistance.
- [ ] The AI can naturally recognize when a student is evaluating a course.
- [ ] Rich course details are available without magic trigger phrases.
- [ ] Simple factual answers remain concise.
- [ ] The assistant cannot falsely treat a presentation-request receipt as verified rendering.
- [ ] Course and section cards use validated data.
- [ ] Mixed tool success/failure produces truthful user-visible results.
- [ ] Rating difficulty direction is consistently correct.
- [ ] Review sample size and uncertain evidence are handled appropriately.
- [ ] Unsupported assessment information is never presented as verified fact.
- [ ] Existing timetable calculations and scenario semantics remain intact.
- [ ] No planner mutation capability has been introduced.
- [ ] Existing tests, lint, TypeScript, and build pass.
- [ ] Relevant real-model evaluation is completed or explicitly marked unverified.
- [ ] Authenticated browser acceptance is completed or explicitly marked unverified.
- [ ] Remaining limitations and subsequent milestone dependencies are documented.

## 11. Student journeys (acceptance)

1. Course exploration: "What is GELH1000?" → "I'm considering taking it." → "Tell me more." → "Which professor is easier?" → "What do students say about the workload?"
2. Academic preference: "I don't want a midterm." → "How about GEST1004?"
3. Alternatives: "I'm considering GELH1000." → "Can you suggest alternatives?"
4. Timetable: "Show my current timetable." → "What if I take this section?" → "Would the hypothetical timetable still have a clash?"
5. Error honesty: one academic lookup succeeds and another fails; never claim zero matching courses when a populated result exists.

## 12. Stop conditions

Stop and report if: a required CopilotKit behavior is unsupported by the installed version (1.79.1); a solution would weaken an authorization or read-only boundary; an unrelated database migration would be required; a needed product decision would materially change the agreed behavior.

## 13. Deliverables

- Plan: `docs/superpowers/plans/2026-10-25-assistant-v2-3-5-a-agent-behavior.md`
- Implementation (minimal, reuses CopilotKit and AI Elements)
- Verification report: `docs/superpowers/verification/2026-10-25-assistant-v2-3-5-a-agent-behavior.md`
- Completion summary. Do not start the next milestone.
