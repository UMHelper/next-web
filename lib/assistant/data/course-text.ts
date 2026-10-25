import { resolveCourseAlias } from "@/lib/database/course-alias";
import { getCourseInfo } from "@/lib/database/get-course-info";
import { McpToolError } from "@/lib/mcp/errors";
import { absoluteUrl, buildCoursePath } from "@/lib/site";

import type { CourseTextOutput } from "../tool-schemas";

/** Descriptions and ILOs are long; cap them so one tool result cannot flood context. */
const MAX_TEXT_CODE_POINTS = 6_000;

export type CourseTextPart = "description" | "ilo";

function readText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function truncate(value: string | null): { text: string | null; truncated: boolean } {
  if (value === null) return { text: null, truncated: false };

  const codePoints = Array.from(value);
  if (codePoints.length <= MAX_TEXT_CODE_POINTS) return { text: value, truncated: false };
  return { text: codePoints.slice(0, MAX_TEXT_CODE_POINTS).join(""), truncated: true };
}

/**
 * Read one long catalog field without pulling the instructor list that
 * `get_course` returns. `getCourseInfo` resolves equivalent (renamed) codes and
 * is cached, so this stays cheap when the model asks for both fields.
 */
export async function getCourseText(
  code: string,
  part: CourseTextPart,
  signal: AbortSignal,
): Promise<CourseTextOutput> {
  if (signal.aborted) throw new McpToolError("temporarily_unavailable");

  const alias = await resolveCourseAlias(code);
  const row = await getCourseInfo(alias.primaryCode);
  if (!row || !row.New_code) throw new McpToolError("not_found");

  const raw = part === "description" ? row.courseDescription : row.ilo;
  const { text, truncated } = truncate(readText(raw));

  return {
    courseCode: row.New_code,
    titleEn: readText(row.courseTitleEng),
    titleZh: readText(row.courseTitleChi),
    text,
    truncated,
    aka: alias.aka,
    url: absoluteUrl(buildCoursePath(row.New_code)),
  };
}
