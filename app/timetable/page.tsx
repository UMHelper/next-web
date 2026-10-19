"use client";

import React from "react";
import Link from "next/link";
import { SignInButton, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";

import AssistantLauncher from "@/components/assistant/assistant-launcher";
import PlanHeader from "@/components/timetable/plan-header";
import PlannerSidebar from "@/components/timetable/planner-sidebar";
import SectionList from "@/components/timetable/section-list";
import WeekGrid from "@/components/timetable/week-grid";
import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import { detectScheduleConflicts } from "@/lib/timetable/conflicts";

const currentTerm = () => ({
  year: Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026),
  sem: Number(process.env.NEXT_PUBLIC_CURRENT_SEM ?? 1),
});

const TimetablePage = () => {
  const pathname = usePathname();
  const { isLoaded, isSignedIn } = useUser();
  const {
    store,
    activePlan,
    createPlan,
    renamePlan,
    deletePlan,
    setActivePlan,
    removeSection,
    syncState,
  } = useTimetablePlanner();

  const plans = Object.values(store.plans);

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">My Timetable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to build and save your timetable plans, then add courses from any review page.
        </p>
        <SignInButton mode="modal" fallbackRedirectUrl={pathname}>
          <span className="mt-6 inline-block cursor-pointer rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground">
            Sign in
          </span>
        </SignInButton>
        <div className="mt-4 text-xs text-foreground-subtle">
          or <Link className="underline" href="/">browse courses</Link>
        </div>
      </div>
    );
  }

  if (!activePlan) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">My Timetable</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Create your first timetable plan, then add courses from any review page.
        </p>
        <button
          type="button"
          onClick={() => createPlan("我的课表", currentTerm())}
          className="mt-6 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-brand-foreground"
        >
          Create timetable
        </button>
        <div className="mt-4 text-xs text-foreground-subtle">
          or <Link className="underline" href="/">browse courses</Link>
        </div>
        <AssistantLauncher plan={undefined} />
      </div>
    );
  }

  const conflicts = detectScheduleConflicts(activePlan.payload.sections);
  const conflictKeys = new Set(conflicts.flatMap((conflict) => [conflict.a.key, conflict.b.key]));
  const credits = activePlan.payload.sections.reduce(
    (total, section) => total + (section.credits ?? 0),
    0,
  );

  return (
    <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
      <PlanHeader
        plans={plans}
        activePlan={activePlan}
        onSelect={setActivePlan}
        onCreate={() => createPlan(`我的课表 ${plans.length + 1}`, currentTerm())}
        onRename={renamePlan}
        onDelete={deletePlan}
      />

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{activePlan.payload.sections.length} sections</span>
        <span>{credits} credits</span>
        <span className={conflicts.length > 0 ? "text-destructive-strong" : ""}>
          {conflicts.length} conflicts
        </span>
        <span>{syncState === "saving" ? "Saving..." : "Saved locally"}</span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <PlannerSidebar />
        <div className="space-y-4">
          <SectionList
            sections={activePlan.payload.sections}
            conflictKeys={conflictKeys}
            onRemove={(key) => removeSection(activePlan.clientRef, key)}
          />

          <div className="overflow-x-auto rounded-xl border border-border bg-background p-4">
            <WeekGrid sections={activePlan.payload.sections} />
          </div>
        </div>
      </div>
      <AssistantLauncher plan={activePlan} />
    </div>
  );
};

export default TimetablePage;
