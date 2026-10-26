import { defineTool } from "@copilotkit/runtime/v2";

import {
  defaultDiscoveryDeps,
  runDiscoverCourseCandidates,
  type DiscoveryDeps,
} from "@/lib/assistant/discovery/discover";
import {
  DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
  discoverCourseCandidatesParameters,
} from "@/lib/assistant/discovery/schema";
import type { PresentationSlot } from "@/lib/assistant/presentation";
import type { TimetableSlot } from "@/lib/assistant/timetable-context";
import { MCP_TOOL_TIMEOUT_MS } from "@/lib/mcp/constants";

export const DISCOVER_COURSE_CANDIDATES_DESCRIPTION =
  "Goal-based course search when the student has no specific codes yet. scope must include a subject anchor (courseType, codePrefix, faculty, department, topics, or maxSuggestedYear). required is only for must/cannot rules (including noClash); preferred is for likes only—state any time window you assume if the student did not give one. Returns ranked candidates with one best section per course plus otherSections; data only—use present_response for a shortlist. Call a section clash-free only when its fit is verified_no_clash. fit not_checked or notApplied entries mean the timetable clash check did not run. Each fit is per course against the saved plan, not a combined schedule—see mutualClashes. examined.truncated means the pool search was bounded.";

export function createDiscoveryTools(
  timetable: TimetableSlot,
  _presentation: PresentationSlot,
  deps: DiscoveryDeps = defaultDiscoveryDeps,
): ReturnType<typeof defineTool>[] {
  return [
    defineTool({
      name: DISCOVER_COURSE_CANDIDATES_TOOL_NAME,
      description: DISCOVER_COURSE_CANDIDATES_DESCRIPTION,
      parameters: discoverCourseCandidatesParameters,
      execute: (args) =>
        runDiscoverCourseCandidates(
          timetable.current,
          args,
          deps,
          AbortSignal.timeout(MCP_TOOL_TIMEOUT_MS),
        ),
    }),
  ];
}
