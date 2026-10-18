"use client";

import {
  CopilotChatToggleButton,
  CopilotKitProvider,
  CopilotSidebar,
  useAgentContext,
  useConfigureSuggestions,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { X } from "lucide-react";
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import {
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
} from "@/lib/assistant/check-plan-conflicts";
import { describeAssistantError } from "@/lib/assistant/error-message";
import { PANEL_WIDTH_DEFAULT } from "@/lib/assistant/panel-width";
import { summarizePlan } from "@/lib/assistant/plan-summary";
import { getSections } from "@/lib/timetable/catalog-client";
import type { LocalPlan } from "@/lib/timetable/store";
import { cn } from "@/lib/utils";

import { ASSISTANT_PILL_CLASS } from "./launcher-pill";
import ResizeHandle, { PANEL_WIDTH_VAR } from "./resize-handle";

// Unmodified copy of @copilotkit/react-core/dist/v2/index.css (Tailwind v4 output). next.config.js stubs the
// package's own import because the app's Tailwind 3 PostCSS plugin rejects it.
const COPILOTKIT_STYLES_HREF = "/assistant/copilotkit-v2.css";
const COPILOTKIT_THEME_HREF = "/assistant/copilotkit-theme.css";
const PRE_ENROLMENT_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/pre-enrolment/";
const ADD_DROP_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/course-add-drop/";
const DATA_UPDATED_AT = process.env.NEXT_PUBLIC_DATABASE_LAST_UPDATE ?? "未知";

// CopilotSidebar remounts its whole view whenever `width` changes, so the value stays constant
// and ResizeHandle moves the CSS variable instead.
const SIDEBAR_WIDTH = `var(${PANEL_WIDTH_VAR}, ${PANEL_WIDTH_DEFAULT}px)`;

const EXAMPLE_QUESTIONS = [
  "有哪些和 accounting 相关的课？",
  "ACCT1000 是什么课？几个学分？",
  "ACCT1000 有哪些 section？什么时间上课？",
];
const EXAMPLE_SUGGESTIONS = {
  available: "before-first-message" as const,
  suggestions: EXAMPLE_QUESTIONS.map((question) => ({ title: question, message: question })),
};

const NoticeContext = createContext<string | null>(null);
const CloseContext = createContext<() => void>(() => {});

function Hidden() {
  return null;
}

const HiddenToggle = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof CopilotChatToggleButton>
>(function HiddenToggle() {
  return null;
});

function PanelHeader() {
  const close = useContext(CloseContext);
  return (
    <header className="flex h-[52px] shrink-0 items-center gap-2 border-b border-border px-4">
      <h2 className="truncate text-sm font-semibold text-foreground">AI 选课助手</h2>
      <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
        试点
      </span>
      <button
        type="button"
        aria-label="收起助手"
        onClick={close}
        className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={16} aria-hidden />
      </button>
    </header>
  );
}

function WelcomeScreen({ input, suggestionView }: { input: ReactNode; suggestionView: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-6">
        <p className="text-sm leading-relaxed text-foreground">
          可以问课程、教授、评价和 section 时间，也能检查某个 section 会不会和你的课表冲突。
        </p>
        <p className="mt-1 text-xs text-muted-foreground">只读，不会改动课表 · 单次对话最多 30 轮</p>
        <div className="mt-4">{suggestionView}</div>
      </div>
      {input}
    </div>
  );
}

function BoundaryNotice({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const notice = useContext(NoticeContext);
  return (
    <div
      {...props}
      className={cn("space-y-1 px-4 pb-2 pt-1.5 text-[11px] leading-snug text-muted-foreground", className)}
    >
      {notice ? (
        <p role="alert" className="text-xs font-medium text-destructive-strong">
          {notice}
        </p>
      ) : null}
      <p>
        本站不是 myUM ·{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href={PRE_ENROLMENT_URL} target="_blank" rel="noreferrer">
          Pre-Enrolment
        </a>
        {" · "}
        <a className="underline underline-offset-2 hover:text-foreground" href={ADD_DROP_URL} target="_blank" rel="noreferrer">
          Add/Drop
        </a>
        {" · "}数据更新于 {DATA_UPDATED_AT}
      </p>
    </div>
  );
}

function AssistantTools({ plan }: { plan: LocalPlan | undefined }) {
  const planRef = useRef(plan);
  planRef.current = plan;

  useAgentContext({ description: "学生当前激活的课表方案（只读）", value: summarizePlan(plan) });
  useConfigureSuggestions(EXAMPLE_SUGGESTIONS);

  useFrontendTool(
    {
      name: "check_plan_conflicts",
      description: "检查某门课某位教授的某个 section 是否与学生当前课表时间冲突。只读，不会修改课表。",
      parameters: checkPlanConflictsParameters,
      handler: async (input) =>
        runCheckPlanConflicts(planRef.current?.payload.sections ?? [], input, getSections),
    },
    [],
  );

  return null;
}

export default function AssistantPanel({ plan }: { plan: LocalPlan | undefined }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(true);
  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <link rel="stylesheet" href={COPILOTKIT_STYLES_HREF} />
      <link rel="stylesheet" href={COPILOTKIT_THEME_HREF} />
      <CopilotKitProvider
        runtimeUrl="/api/copilotkit"
        enableInspector={false}
        onError={({ error }) => setNotice(describeAssistantError(error.message))}
      >
        <AssistantTools plan={plan} />
        <CloseContext.Provider value={close}>
          <NoticeContext.Provider value={notice}>
            <CopilotSidebar
              open={open}
              onOpenChange={setOpen}
              width={SIDEBAR_WIDTH}
              header={PanelHeader}
              toggleButton={HiddenToggle}
              welcomeScreen={WelcomeScreen}
              input={{ disclaimer: BoundaryNotice, showDisclaimer: true, addMenuButton: Hidden }}
            />
          </NoticeContext.Provider>
        </CloseContext.Provider>
      </CopilotKitProvider>
      <ResizeHandle visible={open} />
      {open ? null : (
        <button type="button" onClick={() => setOpen(true)} className={ASSISTANT_PILL_CLASS}>
          AI 选课助手
        </button>
      )}
    </>
  );
}
