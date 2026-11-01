import { normalizePlanSection } from "@/lib/timetable/schema";
import type { TimetableContextPayload } from "@/lib/assistant/timetable-context";
import { FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";

import type { TimetableExpect } from "./timetable-grade";
import type { TimetableEvalCase } from "./timetable-cases";
import { DEFAULT_TIMETABLE_PLAN, timetablePayload } from "./timetable-fixture";

const basePlan = timetablePayload(DEFAULT_TIMETABLE_PLAN);

const manualChangePlan = timetablePayload({
  ...FIXTURE_PLAN,
  payload: {
    schemaVersion: 1,
    sections: FIXTURE_PLAN.payload.sections.map((section) =>
      section.courseCode === "ECON1001"
        ? normalizePlanSection({
            courseCode: "ECON1001",
            prof: "CHEUNG WAI",
            section: "002",
            schedules: [
              { date: "TUE", time: "15:00-16:15", location: "E21-2001" },
              { date: "THU", time: "15:00-16:15", location: "E21-2001" },
            ],
          })
        : section,
    ),
  },
});

const foreignTermPlan = timetablePayload({ ...FIXTURE_PLAN, year: 2025, sem: 2 });

/** Multi-turn scheduling scenarios held out from the tuned V2.3 timetable suite. */
export const TIMETABLE_CONVERSATION_HOLDOUT_CASES: TimetableEvalCase[] = [
  {
    id: "hypo_chain",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      {
        message: "Preview my week if I switch MATH1010 to section 001 with HO SIU MING.",
        expect: { presentation: "preview", previewKind: "hypothetical" },
      },
      {
        message: "Actually try section 003 instead — same instructor.",
        expect: { presentation: "preview", previewKind: "hypothetical" },
      },
      {
        message: "Which of those two previews has fewer morning clashes?",
        expect: { presentation: "text", mention: ["001|003", "morning"] },
      },
    ],
  },
  {
    id: "hypo_then_saved",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      {
        message: "What if I add MATH1010 section 001 with HO SIU MING?",
        expect: { presentation: "preview", previewKind: "hypothetical" },
      },
      {
        message: "Show my actual saved timetable again, not the preview.",
        expect: { presentation: "preview", previewKind: "saved" },
      },
    ],
  },
  {
    id: "preview_ref_this",
    language: "en",
    pathname: "/course/MATH1010",
    timetable: basePlan,
    turns: [
      {
        message: "Preview how section 001 with HO SIU MING would look on my week.",
        expect: { presentation: "preview", previewKind: "hypothetical" },
      },
      {
        message: "Would the other section be better for Wednesday mornings?",
        expect: { presentation: "text", mention: ["002|14:00|09:00"] },
      },
    ],
  },
  {
    id: "day_after_hypo",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      {
        message: "What if I take MATH1010 section 001 with HO SIU MING?",
        expect: { presentation: "preview", previewKind: "hypothetical" },
      },
      {
        message: "In that preview, what happens on Wednesday?",
        expect: { presentation: "text", mention: ["09:00|WED|Wednesday"] },
      },
    ],
  },
  {
    id: "manual_then_clash",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      { message: "Any timetable clashes right now?", expect: { presentation: "text", mention: ["10:00|CISC2001"] } },
      {
        message: "I moved ECON to the afternoon section — do I still have conflicts?",
        timetable: manualChangePlan,
        expect: { presentation: "text", mention: ["no"], forbid: ["10:00-10:15|10:00–10:15"] },
      },
    ],
  },
  {
    id: "term_other_plan",
    language: "en",
    pathname: "/",
    timetable: foreignTermPlan,
    turns: [
      {
        message: "What's on my timetable this semester?",
        expect: { presentation: "text", mention: ["no (saved )?timetable|2025|semester|term"] },
      },
    ],
  },
  {
    id: "ambiguous_preview_ref",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      {
        message: "Preview my week if I switch MATH1010 to section 001 with HO SIU MING.",
        expect: { presentation: "preview", previewKind: "hypothetical" },
      },
      {
        message: "Actually try section 003 instead — same instructor.",
        expect: { presentation: "preview", previewKind: "hypothetical" },
      },
      {
        message: "Would this one work on Wednesday mornings?",
        expect: { presentation: "text", mention: ["\\?|which|mean|001|003"] },
      },
    ],
  },
  {
    id: "stale_preview",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      { message: "Show my timetable.", expect: { presentation: "preview", previewKind: "saved" } },
      {
        message: "I fixed the ECON clash — any conflicts left?",
        timetable: manualChangePlan,
        expect: { presentation: "text", mention: ["no"], forbid: ["10:00-10:15|10:00–10:15"] },
      },
    ],
  },
];

export function holdoutTimetableForTurn(
  evalCase: TimetableEvalCase,
  turn: number,
): TimetableContextPayload {
  return evalCase.turns[turn]?.timetable ?? evalCase.timetable;
}

export type TimetableHoldoutTurnExpect = TimetableExpect;
