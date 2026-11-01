# Semantic product-acceptance rubric — `b2-semantic-v1` (proposed)

Date: 2026-10-27
Status: **proposed**, independently reviewed on 2026-10-27 (record in the [patch verification](../verification/2026-10-27-assistant-b2-patch2-verification.md), §11). Not applied retroactively.
Scope: V2.3.5-B.2 assistant discovery/tool-choice behaviour.
Related records:
- [B.2 patch investigation](../audits/2026-10-27-assistant-b2-patch-investigation.md)
- [B.2 patch final verification](../verification/2026-10-27-assistant-b2-patch2-verification.md)

## 1. Why this rubric exists

The frozen `holdout-v1` protocol measures whether `discover_course_candidates`
was called on turns it declares discovery-required. That is a routing metric, not
a complete definition of a correct answer. One frozen question asks what CIS
intro courses are **offered**; a catalog listing answers it. The protocol still
records discovery as required, so a legitimate listing is scored as a routing
failure.

This rubric is a separate, versioned product instrument. It asks a different
question: did the student get the right kind of help, from the right evidence,
without an unsupported claim?

It does **not**:

- change `holdout-v1` questions, case IDs, repeats, or the discovery-use gate;
- change the original protocol results;
- rescore past runs under a new interpretation;
- authorise forcing discovery on listing questions.

Protocol compliance and semantic product correctness are reported separately.

## 2. Turn-level definition

A turn is **semantically correct** when all three hold:

1. **Intent match** — the evidence path matches the student's objective in §3.
2. **Truthfulness** — no invariant in §4 is violated.
3. **Answer** — the reply addresses the request using the evidence obtained.

Efficiency is reported separately (§5). A turn can be semantically correct and
still be inefficient. A turn is not semantically correct merely because it used
the protocol-mandated tool.

## 3. Intent classes

| ID | Student objective | Acceptable evidence | Failure examples |
|---|---|---|---|
| I1 | **Catalog browse** — what exists, what is offered, show/list catalog entries. No ranking or constraint optimisation requested. | `search_catalog`, `count_courses`, catalog filters. Discovery may also be used; a neutral list is still a browse answer. | Invented entries; claiming an exhaustive catalog from a truncated page; refusing to list. |
| I2 | **Personalized discovery** — recommend, shortlist, which should I take, prioritise, or find options under constraints (subject, year, credit target, topic, time window, ease). | `discover_course_candidates` with at least one scope anchor; `reviewTerms` on the same call when reviews matter. A short clarification is acceptable only when no actionable anchor exists and context cannot settle the missing choice. | Asking for a major, department, or GE/elective direction when a credit target is already actionable; returning a catalog list as a recommendation. |
| I3 | **Factual lookup** — a fact about a named course, instructor, section, or review count. | `get_course`, `get_course_description`, `get_course_ilo`, `get_course_sections`, `get_instructor`, `get_course_reviews`, `count_courses`, `count_reviews`. | Discovery used as a substitute for a named-course fact; stating a fact no tool returned. |
| I4 | **Individual fit** — does this course or section clash with the saved plan? | `check_plan_conflicts`, or discovery with `required.noClash` (per candidate). | Claiming two individually checked sections fit each other. |
| I5 | **Combined verification** — do these selected sections fit together, or together with the saved plan? | `preview_timetable` with the selected sections in `add`, or another deterministic combination preview. Individual checks may gather section data but cannot conclude. | "They fit together" from separate individual fits; naming a combined schedule without a preview. |
| I6 | **Review-sensitive recommendation** — workload, midterms, assessment, teaching quality. | Discovery `reviewEvidence` with `reviewTerms`, or `get_course_reviews` when discovery did not search the course. Aggregate ratings are enough only for rating facts. | Treating `read: 0` or empty review text as proof of no reviews or no midterms; certainty about assessment format. |

I2 and I6 can occur on the same turn. I4 and I5 can occur on the same turn; the
reply must keep the two guarantees distinct.

## 4. Truthfulness invariants (hard)

| ID | Invariant |
|---|---|
| T1 | No invented course code, title, instructor, rating, review text, section, meeting time, or location. |
| T2 | No unsupported clash-free claim. A per-course claim needs per-course evidence; a combined claim needs combination evidence. |
| T3 | Missing or unreadable review text is not proof that reviews, midterms, or assessment details do not exist. No certainty about a midterm-free course without evidence. |
| T4 | A bounded search is not an exhaustive catalog. `examined.truncated`, pagination, and missing review text are acknowledged. |
| T5 | The reply uses the language and script of the student's latest message unless the student asked for another. |
| T6 | "I checked / searched / read" claims match the tools actually called and the results actually returned. |

Any T1–T6 violation makes the turn fail semantic acceptance regardless of tool
choice.

## 5. Scoring and proposed gates

Per turn, report:

- `intent`: I1–I6 match or mismatch, with acceptable alternatives recorded at
  case definition.
- `truth`: T1–T6 violations, listed by ID.
- `semantic`: PASS only when intent matches, truth is clean, and the answer
  addresses the request.
- `efficiency`: counted non-presentation tool calls versus the case's budget,
  median calls, and any repeated review lookup after unreadable evidence.
- `language`: requested script versus reply script, for CJK turns.

Proposed release gates for a frozen set:

| Gate | Proposed threshold |
|---|---|
| S1 Truthfulness | 0 T1–T6 violations |
| S2 Intent match | ≥ 90% of unambiguous turns; ambiguous turns are scored on truth and answer only |
| S3 Combined claims | 0 combined-fit claims without combination evidence |
| S4 Cross-lingual credit action | English, Simplified Chinese, and Traditional Chinese credit-only turns each act without a clarification-first reply |
| S5 Efficiency (reported; separate release decision) | ≥ 90% of turns within the case call budget; median non-presentation calls ≤ 2 |

S5 is deliberately not folded into S1–S4. A verbose but truthful answer is a
different product problem from a false answer, and the two must not hide each
other.

## 6. Frozen `holdout-v1` classification

| Case | Intent | Acceptable path | Notes |
|---|---|---|---|
| `holdout-easy_ge` | I2 | discovery | Constraint-shaped ease/time request. |
| `holdout-history_ge` | I2 + I6 | discovery, optionally review evidence | Topic request; review text may be unreadable. |
| `holdout-first_year_cs` | **I1/I2 ambiguous** | `search_catalog` **or** discovery | Asks what CIS intro courses are **offered**, not which to take. Three repeats. The I1/I2 classification was made from the question text alone, before inspecting the reply; it is not a post-hoc relabel of the protocol case. |
| `holdout-constraints_zh` | I2 + I4 | discovery; per-candidate `noClash` | Explicit individual-fit constraints, not a combined schedule. |
| `holdout-no_midterm` | I2 + I6 | discovery with review terms or targeted reviews | Must not convert missing review text into a midterm guarantee. |
| `holdout-fill_credits_zh` | I2 | discovery with `credits: 3` | Credit-only request is actionable. |

### 6.1 The discovery-use arithmetic

`holdout-v1` has 18 graded turns and declares discovery required on all of them.
Three of those turns are repeats of `holdout-first_year_cs`.

- If all three correctly answer the listing with `search_catalog`, the maximum
  possible discovery-use score is **15/18 = 83.3%**.
- A 90% gate requires at least **17/18** successful discovery calls.
- Therefore the ≥90% gate can be met only if **at least two** of the three
  listing turns call discovery — two unnecessary discovery calls on a listing
  question.

This is a property of the frozen protocol, not of the model. The product must
not be pushed toward discovery on a listing question to satisfy it. The protocol
result stays on record as measured; this rubric reports the semantic result
separately.

## 7. Versioning and independence

- This document is version `b2-semantic-v1`. Any change to intent classes,
  invariants, gates, or the frozen mapping requires a new version.
- A version is usable only after an independent reviewer who did not author it
  records a review against this document and the frozen case definitions.
- Frozen sets (`holdout-v1`, `shadow-v1`, `shadow-v2`) are immutable once run.
  A later set is a new version, not an edit.
- No run is rescored under a later version. Results name the version they used.

## 8. Proposed release-decision procedure

1. Report **P** — the historical protocol result, with its original cases,
   threshold, and discovery-use number. Never relabel P as PASS by changing the
   rubric.
2. Report **S** — semantic acceptance under this rubric, with S1–S5 separately.
3. Report **E** — efficiency defects, even when S passes.
4. A release owner may accept S as the product gate while P remains FAIL only
   when the P failures are documented evaluation-methodology limitations, not
   product defects. That decision is explicit and recorded; it is not a silent
   reinterpretation.
5. Any T1–T6 violation, or any P failure not attributable to a documented
   methodology limitation, blocks release.
