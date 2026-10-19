"use client";

import {
  CopilotChatToggleButton,
  CopilotKitProvider,
  CopilotSidebar,
  useAgentContext,
  useConfigureSuggestions,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import {
  createContext,
  forwardRef,
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

import { AssistantBubble } from "./assistant-bubble";
import ResizeHandle, { PANEL_WIDTH_VAR } from "./resize-handle";

// Unmodified copy of @copilotkit/react-core/dist/v2/index.css (Tailwind v4 output). next.config.js stubs the
// package's own import because the app's Tailwind 3 PostCSS plugin rejects it.
const COPILOTKIT_STYLES_HREF = "/assistant/copilotkit-v2.css";
const COPILOTKIT_THEME_HREF = "/assistant/copilotkit-theme.css";
const PRE_ENROLMENT_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/pre-enrolment/";
const ADD_DROP_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/course-add-drop/";
const DATA_UPDATED_AT = process.env.NEXT_PUBLIC_DATABASE_LAST_UPDATE;
const DATA_UPDATED_ZH = DATA_UPDATED_AT ?? "未知";
const DATA_UPDATED_EN = DATA_UPDATED_AT ?? "Unknown";

// CopilotSidebar remounts its whole view whenever `width` changes, so the value stays constant
// and ResizeHandle moves the CSS variable instead.
const SIDEBAR_WIDTH = `var(${PANEL_WIDTH_VAR}, ${PANEL_WIDTH_DEFAULT}px)`;

const EXAMPLE_QUESTIONS = [
  "有哪些和 accounting 相關的課？",
  "ACCT1000 是什麼課？幾個學分？",
  "ACCT1000 有哪些 section？什麼時間上課？",
];
const EXAMPLE_SUGGESTIONS = {
  available: "before-first-message" as const,
  suggestions: EXAMPLE_QUESTIONS.map((question) => ({ title: question, message: question })),
};

const LABELS = { modalHeaderTitle: "AI 選課助手", chatInputPlaceholder: "輸入你的問題…" };

const NoticeContext = createContext<string | null>(null);

function Hidden() {
  return null;
}

const HiddenToggle = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof CopilotChatToggleButton>
>(function HiddenToggle() {
  return null;
});

function HeaderTitle({ children }: { children?: ReactNode }) {
  return (
    <h2 className="assistant-site-tokens flex items-center gap-2 whitespace-nowrap text-foreground">
      <span className="text-sm font-semibold">{children}</span>
      <span className="shrink-0 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand">
        Beta
      </span>
      <span className="text-[11px] font-normal text-muted-foreground">AI Course Helper</span>
    </h2>
  );
}

const HEADER = { titleContent: HeaderTitle, closeButton: { "aria-label": "收起助手" } };

function WelcomeScreen({ input, suggestionView }: { input: ReactNode; suggestionView: ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto px-4 pt-6">
        <div className="assistant-site-tokens">
          <p className="text-sm leading-relaxed text-foreground">
            可以問課程、教授、評價和 section 時間，也能檢查某個 section 會不會和你的課表衝突。
          </p>
          <p className="mt-1 text-xs text-muted-foreground">只讀，不會改動課表 · 單次對話最多 30 輪</p>
        </div>
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
      className={cn(
        "assistant-site-tokens space-y-1 px-4 pb-2 pt-1.5 text-[11px] leading-snug text-muted-foreground",
        className,
      )}
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
        {" · "}數據更新於 {DATA_UPDATED_ZH}
      </p>
      <p>
        Not myUM · Pre-Enrolment · Add/Drop · Updated {DATA_UPDATED_EN}
      </p>
    </div>
  );
}

function AssistantTools({ plan }: { plan: LocalPlan | undefined }) {
  const planRef = useRef(plan);
  planRef.current = plan;

  useAgentContext({ description: "The student's active timetable plan (read-only)", value: summarizePlan(plan) });
  useConfigureSuggestions(EXAMPLE_SUGGESTIONS);

  useFrontendTool(
    {
      name: "check_plan_conflicts",
      description:
        "Check whether one section of a course taught by an instructor clashes with the student's current timetable. Read-only; never changes the timetable.",
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
        <NoticeContext.Provider value={notice}>
          <CopilotSidebar
            open={open}
            onOpenChange={setOpen}
            width={SIDEBAR_WIDTH}
            labels={LABELS}
            header={HEADER}
            toggleButton={HiddenToggle}
            welcomeScreen={WelcomeScreen}
            input={{ disclaimer: BoundaryNotice, showDisclaimer: true, addMenuButton: Hidden }}
          />
        </NoticeContext.Provider>
      </CopilotKitProvider>
      <ResizeHandle visible={open} />
      {open ? null : (
        <AssistantBubble onClick={() => setOpen(true)} />
      )}
    </>
  );
}
