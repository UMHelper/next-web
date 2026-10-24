import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { CHECK_PLAN_CONFLICTS_DESCRIPTION, checkPlanConflictsParameters } from "@/lib/assistant/check-plan-conflicts";
import { NAVIGATE_DESCRIPTION, navigateParameters } from "@/lib/assistant/navigation";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";
import { PLAN_CONTEXT_DESCRIPTION } from "@/lib/assistant/plan-summary";
import { ASSISTANT_PROMPT } from "@/lib/assistant/prompt";
import { createAssistantTools } from "@/lib/assistant/tools";

/** Everything the model is given apart from the conversation. Importers must mock @copilotkit/runtime/v2 and the MCP data modules. */
export function modelText(): string {
  const tools = createAssistantTools();
  return [
    ASSISTANT_PROMPT,
    NAVIGATE_DESCRIPTION,
    PAGE_CONTEXT_DESCRIPTION,
    PLAN_CONTEXT_DESCRIPTION,
    CHECK_PLAN_CONFLICTS_DESCRIPTION,
    ...tools.map((tool) => tool.description ?? ""),
    ...[...tools.map((tool) => tool.parameters), navigateParameters, checkPlanConflictsParameters].map((schema) =>
      JSON.stringify(zodToJsonSchema(schema as ZodTypeAny)),
    ),
  ].join("\n");
}
