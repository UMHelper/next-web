import type { EvalCase } from "./cases";
import type { ServerToolName } from "./grade";

export type PresentationExpected = "omit" | "course_detail" | "course_sections";

export type PresentationLookup = { name: ServerToolName; code?: string };

export type PresentationCase = {
  id: string;
  expected: PresentationExpected;
  /** Course code for course_detail / course_sections expectations. */
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

/** English presentation choices. Not part of SUITES, so they do not change the navigation fingerprint. */
export const PRESENTATION_CASES: readonly PresentationCase[] = [
  presentationCase(
    "explain",
    "What is CISC3014?",
    [getCourse("CISC3014")],
    "omit",
    undefined,
    "A plain explanation should stay text-first after the course lookup.",
  ),
  presentationCase("short", "CISC3014?", [getCourse("CISC3014")], "omit", undefined, "A terse code question should stay text-first."),
  presentationCase(
    "inspect",
    "Tell me more about CISC3014.",
    [getCourse("CISC3014")],
    "course_detail",
    "CISC3014",
    "Inspecting a course should opt in to the course card.",
  ),
  presentationCase(
    "details",
    "Show me the full details of CISC3014.",
    [getCourse("CISC3014")],
    "course_detail",
    "CISC3014",
    "Full details should opt in to the course card.",
  ),
  presentationCase(
    "compare",
    "CISC2001 vs CISC3014?",
    [getCourse("CISC2001"), getCourse("CISC3014")],
    "omit",
    undefined,
    "A comparison should stay prose or Markdown without cards.",
  ),
  presentationCase(
    "sections",
    "Show me the sections for CISC3014.",
    [getSections("CISC3014")],
    "course_sections",
    "CISC3014",
    "Section cards should opt in when the student asks to see sections.",
  ),
  presentationCase(
    "when",
    "When is CISC3014 taught?",
    [getSections("CISC3014")],
    "omit",
    undefined,
    "A scheduling question should stay text-first after reading class times.",
  ),
  presentationCase(
    "sentence",
    "Just explain CISC3014 in one sentence.",
    [getCourse("CISC3014")],
    "omit",
    undefined,
    "A one-sentence explanation should stay text-first.",
  ),
  presentationCase(
    "table",
    "Give me a table comparing CISC2001 and CISC3014.",
    [getCourse("CISC2001"), getCourse("CISC3014")],
    "omit",
    undefined,
    "An explicit table request should stay Markdown without cards.",
  ),
  presentationCase(
    "colloquial_what",
    "what's CISC3014",
    [getCourse("CISC3014")],
    "omit",
    undefined,
    "Colloquial explain wording should stay text-first.",
  ),
  presentationCase(
    "colloquial_more",
    "more on CISC3014 pls",
    [getCourse("CISC3014")],
    "course_detail",
    "CISC3014",
    "Colloquial inspect wording should opt in to the course card.",
  ),
  presentationCase(
    "colloquial_sections",
    "can u show sections for cisc3014",
    [getSections("CISC3014")],
    "course_sections",
    "CISC3014",
    "Colloquial section inspect should opt in to section cards.",
  ),
  presentationCase(
    "colloquial_compare",
    "cisc2001 or cisc3014 which is easier",
    [getCourse("CISC2001"), getCourse("CISC3014")],
    "omit",
    undefined,
    "Colloquial comparison should stay prose or Markdown without cards.",
  ),
];
