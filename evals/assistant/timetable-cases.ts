import { normalizePlanSection } from "@/lib/timetable/schema";
import type { TimetableContextPayload } from "@/lib/assistant/timetable-context";
import { FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";

import type { TimetableExpect } from "./timetable-grade";
import { DEFAULT_TIMETABLE_PLAN, timetablePayload } from "./timetable-fixture";

export type TimetableEvalCase = {
  id: string;
  language: "en";
  pathname: string;
  turns: Array<{ message: string; expect: TimetableExpect; timetable?: TimetableContextPayload }>;
  timetable: TimetableContextPayload;
};

const basePlan = timetablePayload(DEFAULT_TIMETABLE_PLAN);
const emptyPlan = timetablePayload(undefined);

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

export const TIMETABLE_CASES: TimetableEvalCase[] = [
  {
    id: "overview",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "What's on my timetable?", expect: { presentation: "text", mention: ["CISC3014", "ECON1001", "MATH1010"] } }],
  },
  {
    id: "free_wed",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "Am I free on Wednesday afternoon?", expect: { presentation: "text", mention: ["14:00", "not free|busy|have"] } }],
  },
  {
    id: "earliest",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "What's my earliest class?", expect: { presentation: "text", mention: ["9:00", "CISC2001"] } }],
  },
  {
    id: "clashes",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      {
        message: "Do I have any clashes?",
        expect: {
          presentation: "text",
          mention: ["CISC2001", "ECON1001", "10:00", "GEND1001"],
          forbid: ["no (clash|conflict)"],
        },
      },
    ],
  },
  {
    id: "show",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "Show me my timetable", expect: { presentation: "preview", previewKind: "saved" } }],
  },
  {
    id: "brief",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "Explain my timetable briefly", expect: { presentation: "text" } }],
  },
  {
    id: "what_if",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      {
        message: "What if I take MATH1010 section 001 with HO SIU MING instead?",
        expect: { presentation: "preview", previewKind: "hypothetical", mention: ["CISC3014"] },
      },
    ],
  },
  {
    id: "course_conflict",
    language: "en",
    pathname: "/course/MATH1010",
    timetable: basePlan,
    turns: [
      {
        message: "Will this course conflict with my timetable?",
        expect: {
          presentation: "text",
          tools: [{ name: "check_plan_conflicts", code: "MATH1010" }],
          mention: ["001", "002"],
        },
      },
    ],
  },
  {
    id: "show_conflict",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "Show me where the conflict is", expect: { presentation: "preview", previewKind: "saved" } }],
  },
  {
    id: "switch",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "Change my MATH1010 section to the morning one", expect: { presentation: "either", explainsNoWrite: true } }],
  },
  {
    id: "bro_free",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "bro am i free wed afternoon", expect: { presentation: "text", mention: ["14:00"] } }],
  },
  {
    id: "clash_ah",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "any clash ah?", expect: { presentation: "text", mention: ["ECON1001"] } }],
  },
  {
    id: "week_la",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "show my week la", expect: { presentation: "preview", previewKind: "saved" } }],
  },
  {
    id: "packed",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [{ message: "which day most packed", expect: { presentation: "text", mention: ["Mon"] } }],
  },
  {
    id: "switch_morning",
    language: "en",
    pathname: "/course/MATH1010",
    timetable: basePlan,
    turns: [{ message: "can i switch to the morning section", expect: { presentation: "either", explainsNoWrite: true } }],
  },
  {
    id: "this_class",
    language: "en",
    pathname: "/course/MATH1010",
    timetable: basePlan,
    turns: [{ message: "what if i take this class", expect: { presentation: "text", mention: ["001", "002"] } }],
  },
  {
    id: "followup_day",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      { message: "Show my timetable.", expect: { presentation: "preview", previewKind: "saved" } },
      { message: "What about Wednesday?", expect: { presentation: "text", mention: ["14:00"] } },
    ],
  },
  {
    id: "followup_hypo",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      {
        message: "What if I take MATH1010 section 001 with HO SIU MING instead?",
        expect: { presentation: "preview", previewKind: "hypothetical" },
      },
      {
        message: "What about the morning conflicts?",
        expect: {
          presentation: "text",
          mention: ["CISC3014", "10:00"],
          forbid: [
            "\\bsaved\\s+(plan|timetable|schedule)\\b|\\byour\\s+saved\\s+(plan|timetable)\\b|\\balready\\s+in\\s+your\\s+(saved\\s+)?timetable\\b",
          ],
        },
      },
    ],
  },
  {
    id: "manual_change",
    language: "en",
    pathname: "/",
    timetable: basePlan,
    turns: [
      { message: "Do I have any clashes?", expect: { presentation: "text", mention: ["CISC2001", "ECON1001", "10:00"] } },
      {
        message: "Do I still have conflicts?",
        timetable: manualChangePlan,
        expect: { presentation: "text", mention: ["no"], forbid: ["10:00-10:15|10:00–10:15"] },
      },
    ],
  },
  {
    id: "empty",
    language: "en",
    pathname: "/",
    timetable: emptyPlan,
    turns: [
      {
        message: "What's on my timetable?",
        expect: { presentation: "text", mention: ["no (saved )?timetable|don't have"] },
      },
    ],
  },
];
