import pLimit from "p-limit";

export type UmCourse = {
  offeringUnit: string;
  offeringDept: string;
  courseTitle: string;
  credits: string;
  duration: string;
  mediumOfInstruction: string;
  offeringProgLevel: string;
  courseType: string;
  suggestedYearOfStudy: number | null;
  gradingSystem: string;
  courseDescription: string;
  ilo: string;
};

function text(value: unknown, fallback = ""): string {
  return value == null ? fallback : String(value);
}

export function mapUmCourse(raw: any, code: string): UmCourse {
  const year = Number(raw?.suggestedYearOfStudy);
  return {
    offeringUnit: text(raw?.offeringUnit),
    offeringDept: text(raw?.offeringDept),
    courseTitle: text(raw?.courseTitle, code),
    credits: text(raw?.credits),
    duration: text(raw?.duration, "Semester Course"),
    mediumOfInstruction: text(raw?.mediumOfInstruction),
    offeringProgLevel: text(raw?.offeringProgLevel),
    courseType: text(raw?.courseType),
    suggestedYearOfStudy: Number.isFinite(year) ? year : null,
    gradingSystem: text(raw?.gradingSystem),
    courseDescription: text(raw?.courseDescription),
    ilo: text(raw?.ilo),
  };
}

export function createUmFetcher(resource = "course_catalog") {
  const cache = new Map<string, Promise<UmCourse | null>>();
  const limit = pLimit(6);

  return (rawCode: string): Promise<UmCourse | null> => {
    const code = rawCode.trim().toUpperCase();
    const existing = cache.get(code);
    if (existing) return existing;

    const pending = limit(async () => {
      const response = await fetch(
        `/api/admin/um-proxy?resource=${encodeURIComponent(resource)}&course_code=${encodeURIComponent(code)}`,
      );
      if (!response.ok) return null;
      const body = await response.json();
      const first = body?._embedded?.[0];
      return first ? mapUmCourse(first, code) : null;
    });

    cache.set(code, pending);
    return pending;
  };
}
