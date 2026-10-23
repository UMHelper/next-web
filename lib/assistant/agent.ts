import { BuiltInAgent } from "@copilotkit/runtime/v2";

import type { AssistantConfig } from "./config";
import {
  COURSE_REFERENT_DESCRIPTION,
  courseReferentFromRun,
  type CourseReferentSlot,
} from "./course-referent";
import { withStepMetrics } from "./metrics";
import { createAssistantModel, thinkingProviderOptions } from "./model";
import { ASSISTANT_PROMPT } from "./prompt";
import { replyLanguageContext, replyScriptContext } from "./reply-script";
import { createAssistantTools } from "./tools";

export const ASSISTANT_MAX_STEPS = 5;

export function createAssistantAgent(config: AssistantConfig, signal?: AbortSignal) {
  const slot: CourseReferentSlot = { current: { kind: "none" } };
  const agent = new BuiltInAgent({
    model: withStepMetrics(createAssistantModel(config, signal)),
    prompt: ASSISTANT_PROMPT,
    tools: createAssistantTools(slot),
    maxSteps: ASSISTANT_MAX_STEPS,
    maxOutputTokens: config.maxOutputTokens,
    providerOptions: thinkingProviderOptions(config.thinking),
    overridableProperties: [],
  });
  agent.use((input, next) => {
    slot.current = courseReferentFromRun(input);
    const extra = [
      replyScriptContext(input.messages),
      replyLanguageContext(input.messages),
      { description: COURSE_REFERENT_DESCRIPTION, value: JSON.stringify(slot.current) },
    ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return next.run({ ...input, context: [...input.context, ...extra] });
  });
  return agent;
}
