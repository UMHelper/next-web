# What2Reg AI — V2 Academic Reasoning & Evidence Consistency

Date: 2026-10-28
Worktree: `.worktrees/assistant-v2-3-5-b2`
Branch: `feat/assistant-v2-3-5-b2-remediation`
Baseline verified: `5c01bdc`; referent fix `64d8b64` present
Implementation commit: `833b977`

This is a focused correctness pass on the six-turn website acceptance
conversation. It does not change frozen holdout cases or thresholds, start
V2.3.5-C/V2.4/V3, add comparison tools, add writes, or rebuild the timetable
engine.

## 0. Evidence limitation

No raw six-turn transcript file was present in the repository. The review used
the mission’s reported prompts, observed answers, and the source paths that
produce each claim. Where a tool argument/result was unavailable, the mechanism
was reproduced from the deterministic producer and existing fixtures instead of
inventing a trace. This is stated per finding.

## 1. Classification summary

| Observation | Classification | Confirmed? |
|---|---|---|
| Difficulty numbers described in the wrong direction | **Model reasoning error** with an evidence gap: discovery candidates carried raw difficulty but no scale object | Yes, source + observed text |
| “Updated: no-Friday options” included a Friday course | **Model reasoning/label error**: `tradeoffs` already identified the violated preference, but the contract did not explain the label | Yes, source + observed text |
| Weekly explanation invented an extra Tuesday class | **Model reconstruction error**: no deterministic weekly summary was exposed by `preview_timetable` | Yes, source + observed text |
| “GEST1012 lookup returned the GEST1004 record” | **Unsupported suspicion / model interpretation**, not a confirmed database or mapping defect | Yes, live catalog query found both as distinct primary codes with no alias link |
| Proposed combination called compatible without full preview | **Model reasoning error**: individual `check_plan_conflicts` results were treated as a combined guarantee | Yes, source + observed text |
| Duplicated final user message | **Not a code defect** (DeepSeek balance/transport) | Excluded |

## 2. Difficulty scale

### What happened

The assistant compared GEST1001 (3.83) as easiest against GEST1002 (4.50),
then later used the scale correctly. It also treated GEST1012 (3.95) as easier
than GEST2002 (4.20) and GEST1003 (4.16). On this scale, higher is easier, so
those comparisons are reversed.

### Root cause

`discover_course_candidates` exposed raw `instructors[].difficulty` and a
normalized `signals.ease`, but no `ratingScale`. The only direction statement was
in the global prompt, so the structured result itself did not say which end was
easy. `get_course` already carries `ratingScale`; discovery did not.

### Fix

`discover_course_candidates` now includes the authoritative `ratingScale` object
with the same difficulty sentence used by `get_course`:

> Difficulty: 1 Very hard, 5 Very easy; a HIGHER number means EASIER.

The model can still recommend a lower numerical ease score because timetable or
workload fit is better. It just cannot call that course “easiest.”

Tests:

- discovery result carries `ratingScale.difficulty` with the direction.
- a lower ease course can rank first when it satisfies a preferred schedule;
  the higher-ease course carries a `tradeoffs` preference label.
- existing difficulty-inversion metric remains unchanged.

Decision impact: **yes**, it removes the need to infer scale direction from prose
and reduces a trust-damaging reversal.

## 3. Constraint and preference consistency

### What happened

After “avoid Friday classes,” the table heading said “Updated: no-Friday
options” while it included GEST2002 with Friday meetings. The assistant later
acknowledged the trade-off.

### Root cause

This was not a missing constraint engine. `preferred.avoidDays` already produces
a deterministic `tradeoffs` label such as `no FRI` on the selected section, and
`matched` contains the label when the preference is met. The model overrode that
evidence in its heading. The discovery contract did not explain that `tradeoffs`
is a compromise label, so the result was easy to misread.

### Fix

- Discovery notes now include: preferred rules are soft; a candidate whose
  `tradeoffs` contains `no FRI` is a compromise, not a Friday-free option.
- The tool description says the same and points to `matched` vs `tradeoffs`.
- No second constraint engine and no extra field duplication.

Tests:

- a Friday section produces `tradeoffs: ["no FRI"]` and does **not** produce the
  same label in `matched`;
- a Tuesday section produces `matched: ["no FRI"]`;
- a schedule-fit-first ranking can put the Tuesday course first even though its
  ease score is lower.

Decision impact: **yes**, it prevents a misleading “no-Friday” label without
suppressing useful compromise options.

## 4. Meeting-time and weekly summary accuracy

### What happened

GEST1012-001 and GEST1003-001 were correctly listed as Monday/Thursday
08:30–09:45, but a later weekly explanation added a Tuesday 08:30 class.

### Root cause

`preview_timetable` returned exact section records and conflicts, but no compact
deterministic weekly view. The model reconstructed the week from prose and
introduced a day that was not in the selected sections.

### Fix

`preview_timetable` now returns `facts.week`: one entry per weekday, with exact
`SECTION start-end` strings from `analyzeTimetable`. The tool description tells
the model to use it instead of reconstructing days/times from prose.

This is not a general-purpose natural-language fact-checker. It exposes the
existing deterministic analysis in a compact form.

Tests:

- a hypothetical MATH1010-001 preview includes `MATH1010-001 09:00-10:15` on
  Monday and does not place MATH1010-001 on Tuesday;
- preview round-trip schema tests still pass;
- existing conflict and saved-plan tests are unchanged.

Decision impact: **yes**, it gives the model an authoritative weekly schedule
for explanations.

## 5. GEST1012 / GEST1004 identity claim

### What happened

The assistant said its GEST1012 lookup returned the GEST1004 record.

### Investigation

The source boundary was traced end to end:

1. `get_course` input is normalized to upper case.
2. `resolveCourseAlias` queries `course_catalog` for a primary code or an
   equivalent code.
3. `fetchCourseInfo` loads the resolved primary.
4. `getCourse` projects `course.courseCode` as the primary and `aka` as old
   codes.

A read-only live catalog query against the configured Supabase project found:

| Code | Primary | Equivalent codes |
|---|---|---|
| GEST1012 | GEST1012 | none |
| GEST1004 | GEST1004 | none |
| GEST1001 | GEST1001 | none |
| GEST1002 | GEST1002 | none |
| GEST1003 | GEST1003 | none |
| GEST2002 | GEST2002 | none |

There is **no evidence** of a database alias or mapping that turns GEST1012 into
GEST1004. The likely cause is model interpretation of a different lookup or a
conversation reference. This is not labelled a database defect.

### Defensive fix

The data adapter now refuses to return a course whose primary code differs from
the alias resolution requested, instead of silently passing the record through.
It throws the existing typed `not_found` failure. Old-code aliases still resolve
normally because the resolved primary matches the returned record.

A distinct `identity_mismatch` MCP error code was not added: the public MCP error
enum is shared, and there is no reproduced backend mismatch to justify widening
it. The tool outcome is still typed and non-silent.

Tests:

- requested primary ACCT1012 with a backend ACCT1004 record → `not_found`;
- old code ACCT900 resolving to ACCT1000 still returns the primary record and
  `aka`;
- existing not-found and alias tests pass.

Decision impact: **yes**, a future genuine mapping bug cannot masquerade as a
valid course record.

## 6. Combined timetable verification

### What happened

The assistant identified a genuine mutual conflict between GEST1012 and
GEST1003 from their meeting times, then proposed another combination as
compatible without a full `preview_timetable`.

### Root cause

`check_plan_conflicts` checks one course against the saved plan. Its result did
not say, in structured form, that it is not a combination check. The prompt and
description said combined fit needs `preview_timetable`, but the individual
results were easy to over-read.

### Fix

- `check_plan_conflicts` now returns `combination: "individual_only"` and its
  description says that result never proves a group of sections fits together.
- `preview_timetable` already computes conflicts across saved + added sections;
  it now also returns `facts.week`, and its description says not to pre-check
  individuals for the same sections.
- No forced preview for a direct two-section overlap: a direct meeting-time
  overlap can still be stated as a conflict. A proposed full combination needs
  the preview.

Tests:

- individual check result carries `combination: "individual_only"`;
- preview returns deterministic conflicts and the weekly facts for the combined
  plan;
- existing direct-conflict tests remain unchanged.

Decision impact: **yes**, it separates “these two overlap” from “this proposed
full plan is compatible.”

## 7. Preserved positive behavior

The referent fix from `64d8b64` is unchanged and still covered:

- second displayed recommendation resolves correctly;
- wrong model-guessed code is rewritten to the displayed course;
- instructor lookup succeeds after binding;
- page and explicit-code precedence preserved;
- unpresented discovery results are not visible lists;
- terminal clarification prevents repeated equivalent course-tool attempts.

No prompt growth, new router, new server tool, larger step budget, timetable
write, or persistence work was introduced.

## 8. Modified files

| File | Change |
|---|---|
| `lib/assistant/discovery/discover.ts` | Adds `ratingScale` and the preferred-tradeoff note |
| `lib/assistant/discovery/schema.ts` | Schema for optional `ratingScale` (backward-compatible fixtures) |
| `lib/assistant/discovery/tool.ts` | Explains `matched` vs `tradeoffs` |
| `lib/assistant/timetable-preview.ts` | Adds optional deterministic `facts.week`; guidance |
| `lib/assistant/check-plan-conflicts.ts` | Adds optional `combination: individual_only`; guidance |
| `lib/mcp/data/get-course.ts` | Rejects a returned primary identity that differs from the resolved request |
| `tests/assistant/discovery.test.ts` | Scale, preference tradeoff, schedule-over-ease |
| `tests/assistant/timetable-preview.test.ts` | Exact weekly meeting facts |
| `tests/assistant/check-plan-conflicts.test.ts` | Individual-only scope |
| `tests/mcp/course-instructor.test.ts` | Identity mismatch and alias preservation |
| `tests/assistant/discovery-contract.test.ts` | Tradeoff/compromise guidance |

Optional result fields are used for schema compatibility with existing recorded
fixtures and historical artifacts. The live producer always sets them.

## 9. Verification

| Gate | Result |
|---|---|
| Focused modified tests | **130 tests passed** (4 files) |
| Full Vitest | **282 files / 2472 tests passed** |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0, no warnings |
| `npm run build` | exit 0 |

Logs: `.eval-results/assistant/academic-consistency-final-*.log`.

No historical holdout rerun was performed. B.3 frozen results remain:

- dev 65/72 (90.3%), discovery 36/36;
- holdout 14/18 (77.8%), discovery 15/18 (83.3%) — historical protocol FAIL;
- semantic B.3 18/18 holdout, shadow-v2 8/8 (team/manual evidence).

## 10. Behavior still dependent on LLM judgment

The deterministic evidence is now clearer, but the final prose is still generated
by the model. It can still:

- ignore `ratingScale`, `tradeoffs`, `facts.week`, or `combination` in a
  particular reply;
- choose a poor way to describe a compromise;
- overstate a direct conflict as a full combined verification.

The fix reduces the evidence gap; it does not replace the model with a template.
A future evaluator improvement could assert tool-level fields in live traces, but
that is separate from this product fix.

## 11. Browser verification

**UNVERIFIED.** No signed-in browser session was available.

- The existing `localhost:3000` server runs the stale primary checkout
  `718afd8`, not this revision.
- The B.3 worktree can boot on another port at `833b977`, but is signed-out.
- No Clerk test-account credentials and no Playwright/Puppeteer installation.

Manual replay at desktop viewport ≥1024px (1440×900, 1280×800):

1. Ask for easy GEST courses without morning classes.
2. Refine to avoid Friday. Confirm any Friday course is explicitly labelled a
   compromise, not shown under “no-Friday options.”
3. Ask “Tell me more about the second option and who teaches it.” Confirm the
   displayed second course and instructor.
4. Ask for a comparison. Check difficulty direction against the actual scores:
   higher is easier.
5. Ask which one fits the saved timetable. Check section-level evidence.
6. Ask to take three sections together. Confirm direct overlaps are described as
   conflicts and a proposed alternative uses `preview_timetable` with
   `facts.week`, not an inferred full-plan claim.
7. Confirm no timetable write and no false “saved” language.

## 12. Impact on V2.3.5-B acceptance

- **Implementation:** remains complete; this patch strengthens evidence
  consistency.
- **Internal acceptance:** passes deterministic, integration, and data-boundary
  checks.
- **Browser acceptance:** still UNVERIFIED.
- **Controlled-pilot readiness:** conditional on the existing desktop viewport,
  authorized testers, and the manual checklist.
- **Broad deployment:** not ready; browser runtime, viewport policy, durable
  state, and operational visibility remain open.

The historical protocol FAIL is unchanged. The semantic rubric remains a separate
proposed gate; it is not retroactive proof of protocol compliance.

## 13. Bottom line

Each change answers the required question:

- Difficulty scale: yes, a student can see which direction is easier.
- Friday label: yes, a compromise cannot silently become a “no-Friday” option.
- Weekly meetings: yes, the schedule comes from the selected sections.
- Identity: yes, a different record cannot silently pass as the requested course.
- Combined verification: yes, a full-plan claim needs combined evidence.

No change was made solely to raise a benchmark score. No merge, deployment,
persistence, comparison tool, or V2.3.5-C work was performed.
