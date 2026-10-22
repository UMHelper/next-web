import type { ComponentType, ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { installFakeStorage } from "@/tests/helpers/fake-storage";

type SidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: string;
  labels: { modalHeaderTitle: string; chatInputPlaceholder: string };
  header: { titleContent: ComponentType<{ children: ReactNode }>; closeButton: Record<string, string> };
  toggleButton: ComponentType;
  welcomeScreen?: ComponentType<{ input: ReactNode; suggestionView: ReactNode }>;
  input: { addMenuButton: ComponentType; disclaimer: ComponentType; showDisclaimer: boolean };
};

const {
  sidebarSpy,
  providerSpy,
  suggestionsSpy,
  agentContextSpy,
  plannerMock,
  usePathnameMock,
  pushMock,
  frontendToolSpy,
} = vi.hoisted(() => ({
  sidebarSpy: vi.fn(),
  providerSpy: vi.fn(),
  suggestionsSpy: vi.fn(),
  agentContextSpy: vi.fn(),
  plannerMock: vi.fn(),
  usePathnameMock: vi.fn(() => "/"),
  pushMock: vi.fn(),
  frontendToolSpy: vi.fn(),
}));

let rerenderPanel: (() => void) | undefined;

vi.mock("@copilotkit/react-core/v2", () => ({
  CopilotKitProvider: (props: { children: ReactNode; enableInspector?: boolean }) => {
    providerSpy(props);
    return <>{props.children}</>;
  },
  CopilotSidebar: (props: SidebarProps) => {
    sidebarSpy(props);
    const Title = props.header.titleContent;
    return (
      <div data-testid="copilot-sidebar" data-open={String(props.open)}>
        <Title>{props.labels.modalHeaderTitle}</Title>
        <button type="button" {...props.header.closeButton} onClick={() => props.onOpenChange(false)} />
      </div>
    );
  },
  useAgentContext: agentContextSpy,
  useFrontendTool: (definition: unknown, deps: unknown) => {
    frontendToolSpy(definition, deps);
  },
  useConfigureSuggestions: suggestionsSpy,
}));
vi.mock("@/lib/timetable/catalog-client", () => ({
  getSections: vi.fn(),
  getCourseDetail: vi.fn(),
  getInstructorCourses: vi.fn(),
}));
vi.mock("@/components/timetable/planner-provider", () => ({ useTimetablePlanner: plannerMock }));
vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
  useRouter: () => ({
    push: (path: string) => {
      pushMock(path);
      usePathnameMock.mockReturnValue(path);
      act(() => {
        rerenderPanel?.();
      });
    },
  }),
}));

import AssistantPanel from "@/components/assistant/assistant-panel";
import { navigateParameters } from "@/lib/assistant/navigation";
import { PAGE_CONTEXT_DESCRIPTION } from "@/lib/assistant/page-context";
import { summarizePlan } from "@/lib/assistant/plan-summary";
import type { LocalPlan } from "@/lib/timetable/store";

const lastSidebarProps = () => sidebarSpy.mock.lastCall![0] as SidebarProps;

const lastContext = (description: string) =>
  agentContextSpy.mock.calls.filter(([entry]) => entry.description === description).at(-1)?.[0];

const registeredTools = () => frontendToolSpy.mock.calls.map(([definition]) => definition);

beforeEach(() => {
  installFakeStorage();
  plannerMock.mockReturnValue({ activePlan: undefined });
  usePathnameMock.mockReturnValue("/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  document.documentElement.style.removeProperty("--assistant-width");
  document.documentElement.removeAttribute("data-assistant-open");
});

describe("AssistantPanel", () => {
  it("hides on the header close button and comes back from the reopen pill", () => {
    render(<AssistantPanel suppressed={false} />);
    const sidebar = screen.getByTestId("copilot-sidebar");
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(screen.getByText("AI 選課助手")).toBeTruthy();
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(screen.getByText("AI Course Helper")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "AI 選課助手" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(sidebar.getAttribute("data-open")).toBe("false");

    fireEvent.click(screen.getByRole("button", { name: "AI 選課助手" }));
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(screen.queryByRole("button", { name: "AI 選課助手" })).toBeNull();
  });

  it("uses CopilotKit's header and input with Chinese labels", () => {
    render(<AssistantPanel suppressed={false} />);
    expect(lastSidebarProps().labels).toMatchObject({
      modalHeaderTitle: "AI 選課助手",
      chatInputPlaceholder: "輸入你的問題…",
    });
  });

  it("removes CopilotKit's floating toggle, attach button, and dev inspector", () => {
    render(<AssistantPanel suppressed={false} />);
    const { toggleButton: Toggle, input } = lastSidebarProps();
    const AddMenu = input.addMenuButton;
    expect(render(<Toggle />).container.innerHTML).toBe("");
    expect(render(<AddMenu />).container.innerHTML).toBe("");
    expect(providerSpy.mock.lastCall![0].enableInspector).toBe(false);
  });

  it("offers the three example questions before the first message", () => {
    render(<AssistantPanel suppressed={false} />);
    const questions = [
      "有哪些和 accounting 相關的課？",
      "ACCT1000 是什麼課？幾個學分？",
      "ACCT1000 有哪些 section？什麼時間上課？",
    ];
    expect(suggestionsSpy).toHaveBeenCalledWith({
      available: "before-first-message",
      suggestions: questions.map((question) => ({ title: question, message: question })),
    });
  });

  it("sizes the sidebar from the resizable width variable", () => {
    render(<AssistantPanel suppressed={false} />);
    expect(lastSidebarProps().width).toBe("var(--assistant-width, 380px)");
    expect(document.documentElement.style.getPropertyValue("--assistant-width")).toBe("380px");
    expect(screen.getByRole("separator", { name: "調整助手寬度" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(screen.queryByRole("separator")).toBeNull();
  });

  it("shows the intro and example chips above the input on the welcome screen", () => {
    render(<AssistantPanel suppressed={false} />);
    const Welcome = lastSidebarProps().welcomeScreen!;
    render(
      <Welcome
        input={<div data-testid="input" />}
        suggestionView={<div data-testid="chips" />}
      />,
    );
    expect(screen.getByText(/可以問課程、教授、評價和 section 時間/)).toBeTruthy();
    expect(screen.getByText("只讀，不會改動課表 · 單次對話最多 30 輪")).toBeTruthy();
    expect(screen.getByTestId("chips")).toBeTruthy();
    expect(screen.getByTestId("input")).toBeTruthy();
  });

  it("renders the disclaimer as one compact line with both official links", () => {
    render(<AssistantPanel suppressed={false} />);
    const Disclaimer = lastSidebarProps().input.disclaimer;
    const { container } = render(<Disclaimer />);
    expect(container.textContent).toMatch(/^本站不是 myUM · Pre-Enrolment · Add\/Drop · 數據更新於 /);
    expect(container.textContent).toContain("Not myUM · Pre-Enrolment · Add/Drop · Updated ");
    expect(screen.getByRole("link", { name: "Pre-Enrolment" }).getAttribute("href")).toContain(
      "pre-enrolment",
    );
    expect(screen.getByRole("link", { name: "Add/Drop" }).getAttribute("href")).toContain(
      "course-add-drop",
    );
  });

  it("gives the agent the active plan from the global planner", () => {
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
    expect(lastContext("The student's active timetable plan (read-only)")).toEqual({
      description: "The student's active timetable plan (read-only)",
      value: summarizePlan(plan),
    });
    expect(summarizePlan(plan)).toContain("ACCT1000-A01");
  });

  it("tells the agent which page the student is on and follows client-side navigation", () => {
    usePathnameMock.mockReturnValue("/course/ACCT1000");
    const { rerender } = render(<AssistantPanel suppressed={false} />);
    expect(JSON.parse(lastContext(PAGE_CONTEXT_DESCRIPTION).value)).toEqual({
      page: "course",
      courseCode: "ACCT1000",
    });

    usePathnameMock.mockReturnValue("/reviews/ACCT1000/CHAN%20TAI%20MAN");
    rerender(<AssistantPanel suppressed={false} />);
    expect(JSON.parse(lastContext(PAGE_CONTEXT_DESCRIPTION).value)).toEqual({
      page: "course_reviews",
      courseCode: "ACCT1000",
      instructor: "CHAN TAI MAN",
    });
    expect(providerSpy).toHaveBeenCalled();
    expect(screen.getByTestId("copilot-sidebar").getAttribute("data-open")).toBe("true");
  });

  it("keeps the plan context alongside the page context", () => {
    usePathnameMock.mockReturnValue("/timetable");
    render(<AssistantPanel suppressed={false} />);
    expect(lastContext("The student's active timetable plan (read-only)")?.value).toBe("No timetable plan");
    expect(JSON.parse(lastContext(PAGE_CONTEXT_DESCRIPTION).value)).toEqual({ page: "timetable" });
  });

  it("marks <html> only while the sidebar is visible", () => {
    const { unmount } = render(<AssistantPanel suppressed={false} />);
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "收起助手" }));
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "AI 選課助手" }));
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(true);

    unmount();
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);
  });

  it("closes without a bubble while suppressed and restores the open state afterwards", () => {
    const { rerender } = render(<AssistantPanel suppressed={false} />);
    const sidebar = screen.getByTestId("copilot-sidebar");

    rerender(<AssistantPanel suppressed />);
    expect(sidebar.getAttribute("data-open")).toBe("false");
    expect(screen.queryByRole("button", { name: "AI 選課助手" })).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(false);

    rerender(<AssistantPanel suppressed={false} />);
    expect(sidebar.getAttribute("data-open")).toBe("true");
    expect(document.documentElement.hasAttribute("data-assistant-open")).toBe(true);
  });

  it("registers check_plan_conflicts and navigate as frontend tools", () => {
    render(<AssistantPanel suppressed={false} />);
    expect(registeredTools().map((tool: { name: string }) => tool.name)).toEqual([
      "check_plan_conflicts",
      "navigate",
    ]);
  });

  it("registers navigate with passive follow-up and catalog parameters", () => {
    render(<AssistantPanel suppressed={false} />);
    const navigate = registeredTools().find((tool: { name: string }) => tool.name === "navigate");
    expect(navigate).toMatchObject({
      name: "navigate",
      followUp: true,
      reconnectBehavior: "passive",
      parameters: navigateParameters,
    });
    expect(navigate).not.toHaveProperty("webmcp");
  });

  it("pushes the timetable route when the navigate handler runs", async () => {
    usePathnameMock.mockReturnValue("/course/ACCT1000");
    const view = render(<AssistantPanel suppressed={false} />);
    rerenderPanel = () => {
      view.rerender(<AssistantPanel suppressed={false} />);
    };
    const navigate = registeredTools().find((tool: { name: string }) => tool.name === "navigate") as {
      handler: (input: { destination: string }) => Promise<unknown>;
    };

    await navigate.handler({ destination: "timetable" });

    expect(pushMock).toHaveBeenCalledWith("/timetable");
  });
});
