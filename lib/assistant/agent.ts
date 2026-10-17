import { BuiltInAgent } from "@copilotkit/runtime/v2";

import type { AssistantConfig } from "./config";
import { createAssistantModel, thinkingProviderOptions } from "./model";
import { ASSISTANT_PROMPT } from "./prompt";
import { createAssistantTools } from "./tools";

export const ASSISTANT_MAX_STEPS = 5;

export function createAssistantAgent(config: AssistantConfig, signal?: AbortSignal) {
  return new BuiltInAgent({
    model: createAssistantModel(config, signal),
    prompt: ASSISTANT_PROMPT,
    tools: createAssistantTools(),
    maxSteps: ASSISTANT_MAX_STEPS,
    maxOutputTokens: config.maxOutputTokens,
    providerOptions: thinkingProviderOptions(config.thinking),
    overridableProperties: [],
  });
}
