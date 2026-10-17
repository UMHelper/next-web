"use client";

import {
  CopilotKitProvider,
  CopilotSidebar,
  useAgentContext,
  useFrontendTool,
} from "@copilotkit/react-core/v2";
import { createContext, useContext, useRef, useState, type HTMLAttributes } from "react";

import {
  checkPlanConflictsParameters,
  runCheckPlanConflicts,
} from "@/lib/assistant/check-plan-conflicts";
import { describeAssistantError } from "@/lib/assistant/error-message";
import { summarizePlan } from "@/lib/assistant/plan-summary";
import { getSections } from "@/lib/timetable/catalog-client";
import type { LocalPlan } from "@/lib/timetable/store";
import { cn } from "@/lib/utils";

// Unmodified copy of @copilotkit/react-core/dist/v2/index.css (Tailwind v4 output). next.config.js stubs the
// package's own import because the app's Tailwind 3 PostCSS plugin rejects it.
const COPILOTKIT_STYLES_HREF = "/assistant/copilotkit-v2.css";
const PRE_ENROLMENT_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/pre-enrolment/";
const ADD_DROP_URL =
  "https://reg.um.edu.mo/current-students/enrolment-and-examinations/course-enrolment/course-add-drop/";
const DATA_UPDATED_AT = process.env.NEXT_PUBLIC_DATABASE_LAST_UPDATE ?? "未知";

const NoticeContext = createContext<string | null>(null);

function BoundaryNotice({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  const notice = useContext(NoticeContext);
  return (
    <div {...props} className={cn("space-y-1 px-3 pb-2 text-xs text-muted-foreground", className)}>
      {notice ? (
        <p role="alert" className="font-medium text-destructive-strong">
          {notice}
        </p>
      ) : null}
      <p>
        本站不是 myUM。选课请自己到官方系统提交：
        <a className="underline" href={PRE_ENROLMENT_URL} target="_blank" rel="noreferrer">
          Pre-Enrolment
        </a>
        {" / "}
        <a className="underline" href={ADD_DROP_URL} target="_blank" rel="noreferrer">
          Course Add/Drop
        </a>
      </p>
      <p>课表数据更新于 {DATA_UPDATED_AT}</p>
    </div>
  );
}

function AssistantTools({ plan }: { plan: LocalPlan | undefined }) {
  const planRef = useRef(plan);
  planRef.current = plan;

  useAgentContext({ description: "学生当前激活的课表方案（只读）", value: summarizePlan(plan) });

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

  return (
    <>
      <link rel="stylesheet" href={COPILOTKIT_STYLES_HREF} />
      <CopilotKitProvider
        runtimeUrl="/api/copilotkit"
        onError={({ error }) => setNotice(describeAssistantError(error.message))}
      >
        <AssistantTools plan={plan} />
        <NoticeContext.Provider value={notice}>
          <CopilotSidebar
            defaultOpen
            labels={{
              modalHeaderTitle: "AI 选课助手（试点）",
              welcomeMessageText:
                "可以问课程、教授、评价、section 时间，或某个 section 会不会和你的课表冲突。助手只读，不会改动课表；单次对话最多 30 轮。",
            }}
            input={{ disclaimer: BoundaryNotice, showDisclaimer: true }}
          />
        </NoticeContext.Provider>
      </CopilotKitProvider>
    </>
  );
}
