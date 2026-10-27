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
import {
  TIMETABLE_CONTEXT_DESCRIPTION,
  parseTimetableContext,
  timetableDigest,
  type TimetableSlot,
} from "./timetable-context";
import {
  TIMETABLE_SCENARIO_DESCRIPTION,
  timetableScenarioFromRun,
} from "./timetable-scenario";
import {
  CONFLICT_VERIFICATION_CONTEXT_DESCRIPTION,
  summarizeConflictVerifications,
} from "./conflict-verification";
import { createPresentationLedger, seedLedgerFromMessages, type PresentationSlot } from "./presentation";
import { createAssistantTools } from "./tools";

export const ASSISTANT_MAX_STEPS = 8;

export function createAssistantAgent(config: AssistantConfig, signal?: AbortSignal) {
  const slot: CourseReferentSlot = { current: { kind: "none" }, clarified: false };
  const timetable: TimetableSlot = { current: { status: "unavailable" } };
  const presentation: PresentationSlot = { current: createPresentationLedger() };
  const agent = new BuiltInAgent({
    model: withStepMetrics(createAssistantModel(config, signal)),
    prompt: ASSISTANT_PROMPT,
    tools: createAssistantTools(slot, timetable, presentation),
    maxSteps: ASSISTANT_MAX_STEPS,
    maxOutputTokens: config.maxOutputTokens,
    providerOptions: thinkingProviderOptions(config.thinking),
    overridableProperties: [],
  });
  agent.use((input, next) => {
    presentation.current = createPresentationLedger();
    seedLedgerFromMessages(presentation.current, input.messages);
    slot.current = courseReferentFromRun(input);
    slot.clarified = false;
    const context = [...input.context];
    const timetableIndex = context.findIndex(
      (entry) => entry.description === TIMETABLE_CONTEXT_DESCRIPTION,
    );
    const now = new Date();
    if (timetableIndex >= 0) {
      timetable.current = parseTimetableContext(context[timetableIndex]?.value);
      context[timetableIndex] = {
        ...context[timetableIndex]!,
        value: timetableDigest(timetable.current, now),
      };
    } else {
      timetable.current = { status: "unavailable" };
      context.push({
        description: TIMETABLE_CONTEXT_DESCRIPTION,
        value: timetableDigest(timetable.current, now),
      });
    }
    const digestValue =
      context.find((entry) => entry.description === TIMETABLE_CONTEXT_DESCRIPTION)?.value ?? "";
    let plannerVersion = "unknown";
    try {
      const parsedDigest = JSON.parse(digestValue) as { status?: string; plan?: { version?: string } };
      if (parsedDigest.status === "ready" && parsedDigest.plan?.version) {
        plannerVersion = parsedDigest.plan.version;
      }
    } catch {
      /* keep unknown */
    }
    const scenarioReferent = timetableScenarioFromRun({ context, messages: input.messages }, plannerVersion);
    const conflictVerification = summarizeConflictVerifications(input.messages, plannerVersion);
    const withoutConflictLedger = context.filter(
      (entry) => entry.description !== CONFLICT_VERIFICATION_CONTEXT_DESCRIPTION,
    );
    const extra = [
      replyScriptContext(input.messages),
      replyLanguageContext(input.messages),
      { description: COURSE_REFERENT_DESCRIPTION, value: JSON.stringify(slot.current) },
      { description: TIMETABLE_SCENARIO_DESCRIPTION, value: JSON.stringify(scenarioReferent) },
      { description: CONFLICT_VERIFICATION_CONTEXT_DESCRIPTION, value: conflictVerification },
    ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    return next.run({ ...input, context: [...withoutConflictLedger, ...extra] });
  });
  return agent;
}
