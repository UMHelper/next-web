import type { EvalCase } from "./cases";
import type { ServerToolName } from "./grade";

export type PresentationExpected = "omit" | "course_detail" | "course_sections";

export type PresentationLookup = { name: ServerToolName; code?: string };

export type PresentationCase = {
  id: string;
  expected: PresentationExpected;
  course?: string;
  lookups: readonly PresentationLookup[];
  evalCase: EvalCase;
};

function presentationCase(
  id: string,
  message: string,
  lookups: readonly PresentationLookup[],
  expected: PresentationExpected,
  course: string | undefined,
  why: string,
): PresentationCase {
  const tools = lookups.map((lookup) =>
    lookup.code === undefined ? { name: lookup.name } : { name: lookup.name, args: { code: lookup.code } },
  );
  return {
    id,
    expected,
    course,
    lookups,
    evalCase: {
      id,
      category: "information",
      language: "en",
      pathname: "/",
      why,
      turns: [{ message, expect: { navigate: "forbidden", tools, replyLanguage: "english" } }],
    },
  };
}

const getCourse = (code: string): PresentationLookup => ({ name: "get_course", code });
const getSections = (code: string): PresentationLookup => ({ name: "get_course_sections", code });
const searchCisCourses = (): PresentationLookup => ({ name: "search_catalog" });

/** Holdout prompts — not paraphrases of the fixed 13-case benchmark. */
export const PRESENTATION_HOLDOUT_CASES: readonly PresentationCase[] = [
  presentationCase(
    "holdout_offered",
    "Is CISC2001 offered this term?",
    [getCourse("CISC2001")],
    "omit",
    undefined,
    "Offering status should stay text-first.",
  ),
  presentationCase(
    "holdout_lecture_time",
    "What time is the CISC2001 lecture?",
    [getCourse("CISC2001"), getSections("CISC2001")],
    "omit",
    undefined,
    "A lecture-time question should stay prose without section cards.",
  ),
  presentationCase(
    "holdout_credits",
    "How many credits is CISC3014?",
    [getCourse("CISC3014")],
    "omit",
    undefined,
    "A single-fact question should stay text-first.",
  ),
  presentationCase(
    "holdout_open_card",
    "Open the full CISC2001 course card for me.",
    [getCourse("CISC2001")],
    "course_detail",
    "CISC2001",
    "Explicit course-card inspect should opt in.",
  ),
  presentationCase(
    "holdout_sections_chat",
    "Show all CISC2001 sections in the chat.",
    [getSections("CISC2001")],
    "course_sections",
    "CISC2001",
    "Explicit in-chat section cards should opt in.",
  ),
  presentationCase(
    "holdout_harder",
    "Which is harder, CISC2001 or CISC3014?",
    [getCourse("CISC2001"), getCourse("CISC3014")],
    "omit",
    undefined,
    "Difficulty comparison should stay prose without cards.",
  ),
  presentationCase(
    "holdout_cis_search",
    "List CIS department courses.",
    [searchCisCourses()],
    "omit",
    undefined,
    "Catalog search stays rich via search_catalog only, not course cards.",
  ),
  presentationCase(
    "holdout_describe",
    "Describe CISC2001 in plain words.",
    [getCourse("CISC2001")],
    "omit",
    undefined,
    "Describe wording should stay text-first.",
  ),
  presentationCase(
    "holdout_meet",
    "When does CISC2001 meet?",
    [getCourse("CISC2001"), getSections("CISC2001")],
    "omit",
    undefined,
    "Scheduling wording distinct from benchmark when-case should stay text-first.",
  ),
  presentationCase(
    "holdout_profile",
    "I want the CISC3014 profile card in this sidebar.",
    [getCourse("CISC3014")],
    "course_detail",
    "CISC3014",
    "Profile card language should opt in to course_detail.",
  ),
];
