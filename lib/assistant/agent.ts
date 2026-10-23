import { BuiltInAgent } from "@copilotkit/runtime/v2";

import type { AssistantConfig } from "./config";
import { withStepMetrics } from "./metrics";
import { createAssistantModel, thinkingProviderOptions } from "./model";
import { ASSISTANT_PROMPT } from "./prompt";
import { replyLanguageContext, replyScriptContext } from "./reply-script";
import { createAssistantTools } from "./tools";

export const ASSISTANT_MAX_STEPS = 5;

export function createAssistantAgent(config: AssistantConfig, signal?: AbortSignal) {
  const agent = new BuiltInAgent({
    model: withStepMetrics(createAssistantModel(config, signal)),
    prompt: ASSISTANT_PROMPT,
    tools: createAssistantTools(),
    maxSteps: ASSISTANT_MAX_STEPS,
    maxOutputTokens: config.maxOutputTokens,
    providerOptions: thinkingProviderOptions(config.thinking),
    overridableProperties: [],
  });
  agent.use((input, next) => {
    const extra = [replyScriptContext(input.messages), replyLanguageContext(input.messages)].filter(
      (entry): entry is NonNullable<typeof entry> => entry !== null,
    );
    return next.run(extra.length > 0 ? { ...input, context: [...input.context, ...extra] } : input);
  });
  return agent;
}
