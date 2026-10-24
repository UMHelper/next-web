export const RATING_SCALES = [
  { key: "result", label: "Overall", gloss: "1 Never!, 5 Completely." },
  { key: "grade", label: "Reported grade", gloss: "1 is F and 5 is A. Higher means higher grades reported, not a stricter grader." },
  { key: "difficulty", label: "Difficulty", gloss: "1 Very hard, 5 Very easy. A higher number is easier." },
  { key: "reward", label: "Usefulness", gloss: "1 Waste of time, 5 Very useful." },
  { key: "attendance", label: "Attendance checks", gloss: "1 Always, 5 Never." },
] as const;

export const SMALL_REVIEW_SAMPLE = 5;
