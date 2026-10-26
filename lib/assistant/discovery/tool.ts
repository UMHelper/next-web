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
  "Goal-based course search when the student has no specific codes yet. scope must include a subject anchor (courseType, codePrefix, faculty, department, topics, or maxSuggestedYear). Put credits and excludeCodes in scope, not required. required is only for hard schedule rules (startAfter, endBefore, avoidDays, avoidWindows, noClash); preferred is for soft likes (same time fields plus fewerDays)—use avoidWindows instead of timesToAvoid or noClassBefore. Returns ranked candidates with one best section per course plus otherSections; data only—use present_response for a shortlist. Call a section clash-free only when its fit is verified_no_clash. fit not_checked or notApplied entries mean the timetable clash check did not run. Each fit is per course against the saved plan, not a combined schedule—see mutualClashes. examined.truncated means the pool search was bounded; do not claim the catalog was exhaustively searched. suggestedYear is a catalog hint, not registration eligibility.";

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
