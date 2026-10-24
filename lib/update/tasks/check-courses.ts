import { formatRpcError } from "@/lib/update/errors";
import {
  buildEquivalenceMatchInput,
  buildOfferedCourseInserts,
  uniqueCourseCodes,
} from "@/lib/update/payloads";
import type { UpdateTask } from "@/lib/update/task-types";
import type { UmCourse } from "@/lib/update/um-api";
import { createUmFetcher } from "@/lib/update/um-api";

export const checkCourses: UpdateTask = {
  id: "check-courses",
  label: "补齐缺失课程并标记 offered",
  modes: ["add-drop", "pre-enrollment"],
  async run(ctx) {
    const codes = uniqueCourseCodes(ctx.rows);
    const fetchUm = ctx.fetchUm ?? createUmFetcher();

    const { data: known, error: knownError } = await ctx.client.rpc("admin_resolve_known_codes", { codes });
    if (knownError) throw new Error(formatRpcError(knownError));

    const knownSet = new Set<string>((known ?? []) as string[]);
    const missing = codes.filter((code) => !knownSet.has(code));

    const umCache = new Map<string, UmCourse | null>();
    for (const [index, code] of missing.entries()) {
      if (ctx.signal.aborted) throw new Error("aborted");
      umCache.set(code, await fetchUm(code));
      ctx.onProgress(index + 1, missing.length, `um: ${code}`);
    }

    const inserts = buildOfferedCourseInserts(ctx.rows, missing, umCache);
    let linked = 0;

    if (missing.length > 0) {
      const matchInput = buildEquivalenceMatchInput(ctx.rows, missing, umCache);
      const { data: matches, error: matchError } = await ctx.client.rpc(
        "admin_match_course_equivalences",
        { payload: matchInput },
      );
      if (matchError) throw new Error(formatRpcError(matchError));

      const matchByCode = new Map<string, any>(
        (Array.isArray(matches) ? matches : []).map((match: any) => [
          String(match.primary_code).toUpperCase(),
          match,
        ]),
      );

      if (matchByCode.size > 0) {
        for (let index = 0; index < inserts.length; index += 1) {
          const code = String(inserts[index].New_code);
          const match = matchByCode.get(code);
          if (!match) continue;
          inserts[index] = {
            ...inserts[index],
            equivalent_code: match.equivalent_code,
            equivalence_source: match.source,
            equivalence_confidence: match.confidence,
          };
          linked += 1;
        }
        ctx.onProgress(missing.length, missing.length, `equivalences: ${linked}`);
      }
    }

    const { error } = await ctx.client.rpc("admin_upsert_offered_courses", {
      payload: {
        inserts,
        offered_codes: Array.from(knownSet),
      },
    });
    if (error) throw new Error(formatRpcError(error));

    return `inserted ${inserts.length}, linked ${linked}, marked ${knownSet.size}`;
  },
};
