import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { CATALOG_RESULTS_CONTEXT_DESCRIPTION } from "@/lib/assistant/catalog-result-sets";
import { RICH_TOOL_NAMES } from "@/lib/assistant/rich-tools";
import { installFakeStorage } from "@/tests/helpers/fake-storage";

const {
  providerSpy,
  contextSpy,
  suggestionsSpy,
  toolSpy,
  renderToolSpy,
  plannerMock,
  pathnameMock,
  pushMock,
  chatSpy,
} = vi.hoisted(() => ({
  providerSpy: vi.fn(),
  contextSpy: vi.fn(),
  suggestionsSpy: vi.fn(),
  toolSpy: vi.fn(),
  renderToolSpy: vi.fn(),
  plannerMock: vi.fn(),
  pathnameMock: vi.fn(() => "/"),
  pushMock: vi.fn(),
  chatSpy: vi.fn(),
}));

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: (props: { children: ReactNode; [key: string]: unknown }) => {
    providerSpy(props);
    return <>{props.children}</>;
  },
  useAgent: () => ({ agent: { messages: [] } }),
  useAgentContext: (context: unknown) => contextSpy(context),
  useConfigureSuggestions: (config: unknown) => suggestionsSpy(config),
  useFrontendTool: (definition: unknown, deps: unknown) => toolSpy(definition, deps),
  useRenderTool: (definition: unknown, deps: unknown) => renderToolSpy(definition, deps),
}));

vi.mock("@/components/timetable/planner-provider", () => ({
  useTimetablePlanner: plannerMock,
}));

vi.mock("next/navigation", () => ({
  usePathname: pathnameMock,
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/lib/timetable/catalog-client", () => ({
  getSections: vi.fn(),
  getCourseDetail: vi.fn(),
  getInstructorCourses: vi.fn(),
}));

vi.mock("@/components/assistant/assistant-chat", () => ({
  default: (props: {
    notice: string | null;
    onClose: () => void;
    onClearNotice: () => void;
  }) => {
    chatSpy(props);
    return (
      <div data-testid="assistant-chat">
        <button type="button" onClick={props.onClose}>
          close-chat
        </button>
        <span data-testid="chat-notice">{props.notice}</span>
      </div>
    );
  },
}));

import AssistantPanel from "@/components/assistant/assistant-panel";
import { EXAMPLE_QUESTIONS } from "@/lib/assistant/example-questions";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";
import { TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION } from "@/lib/assistant/timetable-previews";
import {
  TIMETABLE_CONTEXT_DESCRIPTION,
  buildTimetableContextPayload,
  serializeTimetableContext,
} from "@/lib/assistant/timetable-context";
import { plannerCurrentTerm } from "@/lib/timetable/current-term";
import { FIXTURE_PLAN } from "@/tests/fixtures/timetable-plan";
import { plannerState } from "@/tests/helpers/planner-state";

const contexts = () => contextSpy.mock.calls.map(([context]) => context);
const tools = () => toolSpy.mock.calls.map(([definition]) => definition);

beforeEach(() => {
  installFakeStorage();
  plannerMock.mockReturnValue(plannerState(undefined));
  pathnameMock.mockReturnValue("/");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.documentElement.style.removeProperty("--assistant-width");
  document.documentElement.removeAttribute("data-assistant-open");
});

describe("AssistantPanel", () => {
  it("mounts the provider, chat, resize handle and tool registrations", () => {
    render(<AssistantPanel suppressed={false} />);

    expect(providerSpy.mock.lastCall![0]).toMatchObject({
      runtimeUrl: "/api/copilotkit",
      enableInspector: false,
    });
    expect(screen.getByTestId("assistant-chat")).toBeTruthy();
    expect(screen.getByRole("separator", { name: "Resize assistant" })).toBeTruthy();
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(true);
    expect(tools().map((tool) => tool.name).sort()).toEqual(["filter_catalog_results", "navigate"]);
    expect(
      contexts().some((context) => context.description === CATALOG_RESULTS_CONTEXT_DESCRIPTION),
    ).toBe(true);
    expect(
      contexts().some((context) => context.description === TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION),
    ).toBe(true);
    expect(
      contexts().find((context) => context.description === TIMETABLE_PREVIEWS_CONTEXT_DESCRIPTION)?.value,
    ).toBe(JSON.stringify({ previews: [] }));
    expect(RICH_TOOL_NAMES.has("search_catalog")).toBe(true);
    expect(RICH_TOOL_NAMES.has("filter_catalog_results")).toBe(true);
    expect(renderToolSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "search_catalog" }),
      [],
    );
  });

  it("registers the plan and page context and the configured suggestions", () => {
    pathnameMock.mockReturnValue("/course/ACCT1000");
    render(<AssistantPanel suppressed={false} />);

    const timetableContext = contexts().find(
      (context) => context.description === TIMETABLE_CONTEXT_DESCRIPTION,
    );
    expect(timetableContext?.value).toBe(
      serializeTimetableContext(
        buildTimetableContextPayload(plannerState(undefined), plannerCurrentTerm()),
      ),
    );

    const pageContext = contexts().find(
      (context) => context.description === PAGE_CONTEXT_DESCRIPTION,
    );
    expect(JSON.parse(pageContext!.value)).toEqual({
      page: "course",
      courseCode: "ACCT1000",
    });

    expect(suggestionsSpy.mock.lastCall![0]).toEqual({
      available: "before-first-message",
      suggestions: EXAMPLE_QUESTIONS.map((question) => ({ title: question, message: question })),
    });
  });

  it("registers the timetable payload from the planner", () => {
    plannerMock.mockReturnValue(plannerState(FIXTURE_PLAN));

    render(<AssistantPanel suppressed={false} />);
    const timetableContext = contexts().find(
      (context) => context.description === TIMETABLE_CONTEXT_DESCRIPTION,
    );
    expect(timetableContext?.value).toBe(
      serializeTimetableContext(
        buildTimetableContextPayload(plannerState(FIXTURE_PLAN), plannerCurrentTerm()),
      ),
    );
  });

  it("re-registers the payload after a manual planner change", () => {
    plannerMock.mockReturnValue(plannerState(FIXTURE_PLAN));
    const { rerender } = render(<AssistantPanel suppressed={false} />);
    const timetableValue = () =>
      contextSpy.mock.calls
        .map(([context]) => context)
        .filter((context) => context.description === TIMETABLE_CONTEXT_DESCRIPTION)
        .at(-1)?.value;
    const first = timetableValue();

    plannerMock.mockReturnValue(plannerState({ ...FIXTURE_PLAN, name: "Updated plan" }));
    rerender(<AssistantPanel suppressed={false} />);
    const second = timetableValue();

    expect(first).not.toBe(second);
  });

  it("hides the panel and the reopen pill when the route suppresses it", () => {
    render(<AssistantPanel suppressed />);

    expect(screen.queryByTestId("assistant-chat")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(screen.queryByRole("button", { name: "AI Course Helper" })).toBeNull();
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);
  });

  it("closes from the chat and reopens when Ask AI fires again", async () => {
    const { rerender } = render(<AssistantPanel suppressed={false} openToken={0} />);

    fireEvent.click(screen.getByRole("button", { name: "close-chat" }));
    await waitFor(() => expect(screen.queryByTestId("assistant-chat")).toBeNull());
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);

    rerender(<AssistantPanel suppressed={false} openToken={1} />);
    await waitFor(() => expect(screen.getByTestId("assistant-chat")).toBeTruthy());
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(true);
  });

  it("surfaces a provider error as the chat notice", () => {
    render(<AssistantPanel suppressed={false} />);

    const onError = providerSpy.mock.lastCall![0].onError as (args: { error: Error }) => void;
    act(() => onError({ error: new Error("429") }));

    expect(screen.getByTestId("chat-notice").textContent).toBe(
      "Too many requests. Please try again later.",
    );
  });
});
