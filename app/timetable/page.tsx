"use client";

import React from "react";
import Link from "next/link";

import PlanHeader from "@/components/timetable/plan-header";
import SectionList from "@/components/timetable/section-list";
import WeekGrid from "@/components/timetable/week-grid";
import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import { detectScheduleConflicts } from "@/lib/timetable/conflicts";

const currentTerm = () => ({
  year: Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026),
  sem: Number(process.env.NEXT_PUBLIC_CURRENT_SEM ?? 1),
});

const TimetablePage = () => {
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

  if (!activePlan) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">My Timetable</h1>
        <p className="mt-2 text-sm text-slate-500">
          Create your first timetable plan, then add courses from any review page.
        </p>
        <button
          type="button"
          onClick={() => createPlan("我的课表", currentTerm())}
          className="mt-6 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Create timetable
        </button>
        <div className="mt-4 text-xs text-slate-400">
          or <Link className="underline" href="/">browse courses</Link>
        </div>
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

      <div className="flex items-center gap-4 text-sm text-slate-500">
        <span>{activePlan.payload.sections.length} sections</span>
        <span>{credits} credits</span>
        <span className={conflicts.length > 0 ? "text-red-600" : ""}>
          {conflicts.length} conflicts
        </span>
        <span>{syncState === "saving" ? "Saving..." : "Saved locally"}</span>
      </div>

      <SectionList sections={activePlan.payload.sections} conflictKeys={conflictKeys} onRemove={(key) => removeSection(activePlan.clientRef, key)} />

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <WeekGrid sections={activePlan.payload.sections} />
      </div>
    </div>
  );
};

export default TimetablePage;
