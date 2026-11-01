import { defineTool } from "@copilotkit/runtime/v2";

import {
  defaultDiscoveryDeps,
  runDiscoverCourseCandidates,
  type DiscoveryDeps,
} from "@/lib/assistant/discovery/discover";
import {
  DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
  discoverCourseCandidatesInputSchema,
} from "@/lib/assistant/discovery/schema";
import { trackDiscovery, type PresentationSlot } from "@/lib/assistant/presentation";
import type { TimetableSlot } from "@/lib/assistant/timetable-context";
import { MCP_TOOL_TIMEOUT_MS } from "@/lib/mcp/constants";

export const DISCOVER_COURSE_CANDIDATES_DESCRIPTION =
  "Personalized discovery for a recommendation, a shortlist, or which should I take: subject, department, year, credit, topic, or schedule goals. search_catalog browses or lists catalog entries; this tool turns a goal into ranked, fit-checked candidates. When the student names a subject (GEST, CISC), set codePrefix or department as well as courseType; courseType alone is usually too broad. A credit target, level, topic, time window, or ease preference is enough: one constraint is enough to act, and do not ask for a department first. Topics are short keywords and spelling variants, not sentences. When reviews will be discussed, pass reviewTerms in the same call; do not read reviews one course at a time. When reviewEvidence.read is 0, do not re-read it or fan out to other candidates in that result—report the missing evidence once. scope must include at least one anchor among courseType, codePrefix, faculty, department, topics, maxSuggestedYear, or credits. excludeCodes belongs in scope, not required. required is only for hard schedule rules (startAfter, endBefore, avoidDays, avoidWindows, noClash); preferred is for soft likes (same time fields plus fewerDays)—use avoidWindows instead of timesToAvoid or noClassBefore. required.noClash verifies each candidate against the saved plan individually; combined fit needs preview_timetable. Returns ranked candidates with one best section per course plus otherSections; data only—use present_response for a shortlist. Call a section clash-free only when its fit is verified_no_clash. fit not_checked or notApplied entries mean the timetable clash check did not run. Each fit is per course against the saved plan, not a combined schedule—see mutualClashes. examined.truncated means the pool search was bounded; do not claim the catalog was exhaustively searched. When candidates is empty and examined.truncated is false, this is a complete no-match: report which constraints were applied, suggest relaxing one, and do not repeat the same search or enumerate the subject to double-check. matched lists satisfied rules; tradeoffs lists violated or unverified preferences, so a candidate with 'no FRI' in tradeoffs is a compromise, not a Friday-free option. suggestedYear is a catalog hint, not registration eligibility.";

export function createDiscoveryTools(
  timetable: TimetableSlot,
  presentation: PresentationSlot,
  deps: DiscoveryDeps = defaultDiscoveryDeps,
): ReturnType<typeof defineTool>[] {
  return [
    defineTool({
      name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
      description: DISCOVER_COURSE_CANDIDATES_DESCRIPTION,
      parameters: discoverCourseCandidatesInputSchema,
      // Discovery uses trackDiscovery + runDiscoverCourseCandidates instead of runReadOnlyTool
      // so presentation ledger updates stay in one place; still read-only.
      execute: (args) =>
        trackDiscovery(
          presentation.current,
          runDiscoverCourseCandidates(
            timetable.current,
            args,
            deps,
            AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS),
          ),
        ),
    }),
  ];
}
