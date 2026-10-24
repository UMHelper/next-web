import { createHash, randomUUID } from "node:crypto";

import type { Context, Message, Tool, ToolCall } from "@ag-ui/client";
import { schemaToJsonSchema } from "@copilotkit/shared";
import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import { createAssistantAgent } from "@/lib/assistant/agent";
import type { AssistantConfig } from "@/lib/assistant/config";
import { shapeConversation, type RunMessage } from "@/lib/assistant/conversation";
import {
  MAX_NAVIGATIONS_PER_MESSAGE,
  NAVIGATE_DESCRIPTION,
  buildNavigationPath,
  navigateParameters,
  navigationsSinceLastUserMessage,
  parseDestination,
  samePage,
  verifyDestination,
  type NavigateResult,
} from "@/lib/assistant/navigation";
import { PAGE_CONTEXT_DESCRIPTION, describePage } from "@/lib/assistant/page-context";
import {
  TIMETABLE_CONTEXT_DESCRIPTION,
  serializeTimetableContext,
} from "@/lib/assistant/timetable-context";
import { ASSISTANT_PROMPT } from "@/lib/assistant/prompt";

import type { EvalCase } from "./cases";
import { evalNavigationLookups } from "./catalog";
import type { RunTrace, StepMetrics, ToolCallRecord, TurnTrace } from "./grade";
import { captureRequests, type RequestAudit } from "./request-audit";

export const MAX_RUNS_PER_TURN = 4;

export const PROMPT_FINGERPRINT = createHash("sha256")
  .update(ASSISTANT_PROMPT)
  .update(NAVIGATE_DESCRIPTION)
  .digest("hex")
  .slice(0, 12);

export class BudgetExhausted extends Error {
  name = "BudgetExhausted";
}

export type EvalBudget = { maxSteps: number; used: number };
export type HarnessOptions = { config: AssistantConfig; budget: EvalBudget; repeat: number };

type Session = { pathname: string; messages: Message[] };
type PendingCall = { id: string; name: string; args: Record<string, unknown> };

function stripAdditionalProperties(node: unknown): void {
  if (Array.isArray(node)) {
    node.forEach(stripAdditionalProperties);
    return;
  }
  if (typeof node !== "object" || node === null) return;
  delete (node as Record<string, unknown>).additionalProperties;
  Object.values(node).forEach(stripAdditionalProperties);
}

// Must stay identical to createToolSchema in @copilotkit/core, which builds what the runtime receives.
function frontendToolSchema(parameters: ZodTypeAny): Record<string, unknown> {
  const { $schema: _schema, ...schema } = schemaToJsonSchema(parameters, {
    zodToJsonSchema: (value, options) =>
      zodToJsonSchema(value as ZodTypeAny, options as Parameters<typeof zodToJsonSchema>[1]) as Record<string, unknown>,
  });
  stripAdditionalProperties(schema);
  return schema;
}

const FRONTEND_TOOLS: Tool[] = [
  { name: "navigate", description: NAVIGATE_DESCRIPTION, parameters: frontendToolSchema(navigateParameters) },
];
const FRONTEND_TOOL_NAMES = new Set(FRONTEND_TOOLS.map((tool) => tool.name));

function parseArgs(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const toolCallsIn = (messages: Message[]): ToolCall[] =>
  messages.flatMap((message) => (message.role === "assistant" ? (message.toolCalls ?? []) : []));

const historyBytes = (messages: Message[]) => Buffer.byteLength(JSON.stringify(messages));

function captureStepMetrics(into: StepMetrics[]): () => void {
  const original = console.log;
  console.log = (...args: unknown[]) => {
    if (args[0] === "[assistant] step" && typeof args[1] === "string") into.push(JSON.parse(args[1]) as StepMetrics);
    else original(...args);
  };
  return () => {
    console.log = original;
  };
}

async function simulateNavigate(input: unknown, session: Session): Promise<NavigateResult> {
  const destination = parseDestination(input);
  if (!destination) return { status: "invalid_destination" };
  if (navigationsSinceLastUserMessage(session.messages) >= MAX_NAVIGATIONS_PER_MESSAGE) {
    return { status: "limit_reached" };
  }
  const path = buildNavigationPath(destination);
  const target = describePage(path);
  if (samePage(describePage(session.pathname), target)) return { status: "already_here", page: target };
  const existence = await verifyDestination(destination, evalNavigationLookups);
  if (existence === "missing") return { status: "not_found" };
  if (existence === "unavailable") return { status: "unavailable" };
  session.pathname = path;
  return { status: "navigated", page: target };
}

async function runFrontendTool(call: PendingCall, session: Session): Promise<unknown> {
  if (call.name === "navigate") return simulateNavigate(call.args, session);
  return { status: "invalid_request" };
}

async function runOnce(session: Session, options: HarnessOptions, continuation: boolean) {
  if (options.budget.used >= options.budget.maxSteps) {
    throw new BudgetExhausted(`model step budget of ${options.budget.maxSteps} used up`);
  }
  const steps: StepMetrics[] = [];
  const requests: RequestAudit[] = [];
  const restoreLog = captureStepMetrics(steps);
  // The model binds fetch when it is built, so the capture must be installed before createAssistantAgent.
  const restoreFetch = captureRequests(requests);
  const started = Date.now();
  let newMessages: Message[] = [];
  let error: string | undefined;
  try {
    const agent = createAssistantAgent(options.config);
    agent.setMessages(shapeConversation(session.messages as RunMessage[], options.config.historyTurns) as Message[]);
    const context: Context[] = [
      {
        description: TIMETABLE_CONTEXT_DESCRIPTION,
        value: serializeTimetableContext({ v: 1, status: "no_plan", currentTerm: { year: 2026, sem: 1 } }),
      },
      { description: PAGE_CONTEXT_DESCRIPTION, value: JSON.stringify(describePage(session.pathname)) },
    ];
    ({ newMessages } = await agent.runAgent({ runId: randomUUID(), tools: FRONTEND_TOOLS, context }));
  } catch (caught) {
    error = caught instanceof Error ? `${caught.name}: ${caught.message}`.slice(0, 200) : "unknown";
  } finally {
    restoreFetch();
    restoreLog();
    options.budget.used += Math.max(steps.length, 1);
  }
  session.messages.push(...newMessages);

  const answered = new Set(session.messages.flatMap((message) => (message.role === "tool" ? [message.toolCallId] : [])));
  const pending: PendingCall[] = toolCallsIn(newMessages)
    .filter((call) => FRONTEND_TOOL_NAMES.has(call.function.name) && !answered.has(call.id))
    .map((call) => ({ id: call.id, name: call.function.name, args: parseArgs(call.function.arguments) }));
  const trace: RunTrace = {
    continuation,
    ms: Date.now() - started,
    steps,
    error,
    requests,
    reasoningMessages: newMessages.filter((message) => message.role === "reasoning").length,
  };
  return { trace, pending };
}

function toolCallsOf(messages: Message[]): ToolCallRecord[] {
  const results = new Map(
    messages.flatMap((message) => (message.role === "tool" ? [[message.toolCallId, message.content] as const] : [])),
  );
  return toolCallsIn(messages).map((call) => ({
    name: call.function.name,
    args: parseArgs(call.function.arguments),
    result: results.get(call.id) as string | undefined,
  }));
}

function replyOf(messages: Message[]): string {
  return messages
    .flatMap((message) =>
      message.role === "assistant" && typeof message.content === "string" && message.content.trim() !== ""
        ? [message.content]
        : [],
    )
    .join("\n");
}

async function runTurn(
  caseId: string,
  turn: number,
  message: string,
  session: Session,
  options: HarnessOptions,
): Promise<TurnTrace> {
  const started = Date.now();
  const pathnameBefore = session.pathname;
  const lengthBefore = session.messages.length;
  const bytesBefore = historyBytes(session.messages);
  session.messages.push({ id: randomUUID(), role: "user", content: message });
  const turnStart = session.messages.length - 1;

  const runs: RunTrace[] = [];
  let runCapHit = false;
  let error: string | undefined;
  for (;;) {
    if (runs.length === MAX_RUNS_PER_TURN) {
      runCapHit = true;
      break;
    }
    const { trace, pending } = await runOnce(session, options, runs.length > 0);
    runs.push(trace);
    if (trace.error !== undefined) {
      error = trace.error;
      break;
    }
    if (pending.length === 0) break;
    for (const call of pending) {
      const result = await runFrontendTool(call, session);
      session.messages.push({ id: randomUUID(), role: "tool", toolCallId: call.id, content: JSON.stringify(result) });
    }
  }

  const turnMessages = session.messages.slice(turnStart);
  return {
    caseId,
    repeat: options.repeat,
    turn,
    message,
    pathnameBefore,
    pathnameAfter: session.pathname,
    toolCalls: toolCallsOf(turnMessages),
    runs,
    reply: replyOf(turnMessages),
    ms: Date.now() - started,
    runCapHit,
    error,
    messagesAdded: session.messages.length - lengthBefore,
    bytesAdded: historyBytes(session.messages) - bytesBefore,
  };
}

export async function runCase(evalCase: EvalCase, options: HarnessOptions): Promise<TurnTrace[]> {
  const session: Session = { pathname: evalCase.pathname, messages: [] };
  const traces: TurnTrace[] = [];
  for (const [turn, { message }] of evalCase.turns.entries()) {
    traces.push(await runTurn(evalCase.id, turn, message, session, options));
  }
  return traces;
}
