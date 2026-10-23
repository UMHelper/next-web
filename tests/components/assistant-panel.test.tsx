import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

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
import { summarizePlan } from "@/lib/assistant/plan-summary";
import type { LocalPlan } from "@/lib/timetable/store";

const contexts = () => contextSpy.mock.calls.map(([context]) => context);
const tools = () => toolSpy.mock.calls.map(([definition]) => definition);

beforeEach(() => {
  installFakeStorage();
  plannerMock.mockReturnValue({ activePlan: undefined });
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
    expect(tools().map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["check_plan_conflicts", "navigate"]),
    );
    expect(renderToolSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: "search_catalog" }),
      [],
    );
  });

  it("registers the plan and page context and the configured suggestions", () => {
    pathnameMock.mockReturnValue("/course/ACCT1000");
    render(<AssistantPanel suppressed={false} />);

    const planContext = contexts().find(
      (context) => context.description === "The student's active timetable plan (read-only)",
    );
    expect(planContext?.value).toBe("No timetable plan");

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

  it("follows the active plan from the global planner", () => {
    const plan = {
      clientRef: "plan-1",
      name: "我的课表",
      year: 2026,
      sem: 1,
      payload: {
        schemaVersion: 1,
        sections: [
          {
            key: "ACCT1000|CHAN|A01",
            courseCode: "ACCT1000",
            prof: "CHAN",
            section: "A01",
            color: "#2563eb",
            schedules: [{ date: "MON", time: "09:00-10:00", location: "E4" }],
          },
        ],
      },
      revision: 1,
      syncState: "idle",
    } as unknown as LocalPlan;
    plannerMock.mockReturnValue({ activePlan: plan });

    render(<AssistantPanel suppressed={false} />);
    const planContext = contexts().find(
      (context) => context.description === "The student's active timetable plan (read-only)",
    );
    expect(planContext?.value).toBe(summarizePlan(plan));
    expect(summarizePlan(plan)).toContain("ACCT1000-A01");
  });

  it("hides the panel and the reopen pill when the route suppresses it", () => {
    render(<AssistantPanel suppressed />);

    expect(screen.queryByTestId("assistant-chat")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(screen.queryByRole("button", { name: "AI Course Helper" })).toBeNull();
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);
  });

  it("closes from the chat and reopens from the bubble", () => {
    render(<AssistantPanel suppressed={false} />);

    fireEvent.click(screen.getByRole("button", { name: "close-chat" }));
    expect(screen.queryByTestId("assistant-chat")).toBeNull();
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "AI Course Helper" }));
    expect(screen.getByTestId("assistant-chat")).toBeTruthy();
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
