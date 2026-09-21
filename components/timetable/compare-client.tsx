"use client";

import React, { useEffect, useMemo, useState } from "react";

import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import WeekGrid from "@/components/timetable/week-grid";
import { computeCommonFree } from "@/lib/timetable/common-free";
import { useSharedPlan } from "@/lib/timetable/use-shared-plan";

export default function CompareClient({ token }: { token: string }) {
  const { store } = useTimetablePlanner();
  const { plan: sharedPlan, loading, stale, error } = useSharedPlan(token);
  const [ownRef, setOwnRef] = useState<string>();

  const ownPlans = useMemo(
    () => Object.values(store.plans).filter((plan) => plan.year === sharedPlan?.year && plan.sem === sharedPlan?.sem),
    [sharedPlan?.sem, sharedPlan?.year, store.plans],
  );

  useEffect(() => {
    if (!ownRef && ownPlans.length > 0) setOwnRef(ownPlans[0].clientRef);
  }, [ownRef, ownPlans]);

  const ownPlan = ownPlans.find((plan) => plan.clientRef === ownRef);

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-500">Loading shared timetable...</div>;
  }

  if (error || !sharedPlan) {
    return (
      <div className="p-8 text-center text-sm text-red-600">
        This share link is invalid or no longer available.
      </div>
    );
  }

  const commonFree = ownPlan
    ? computeCommonFree(sharedPlan.payload.sections, ownPlan.payload.sections)
    : [];

  return (
    <div className="mx-auto max-w-screen-xl space-y-4 px-4 py-6">
      <div>
        <h1 className="text-xl font-bold">Compare timetables</h1>
        <p className="text-sm text-slate-500">
          Shared plan: {sharedPlan.name} ({sharedPlan.year} Sem {sharedPlan.sem})
          {stale ? " · showing last loaded version" : ""}
        </p>
      </div>

      {ownPlans.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
          You need a plan for {sharedPlan.year} Sem {sharedPlan.sem} to compare.
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <label htmlFor="own-plan" className="text-sm text-slate-600">
            My plan
          </label>
          <select
            id="own-plan"
            value={ownRef}
            onChange={(event) => setOwnRef(event.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm"
          >
            {ownPlans.map((plan) => (
              <option key={plan.clientRef} value={plan.clientRef}>
                {plan.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">对方方案</h2>
          <WeekGrid sections={sharedPlan.payload.sections} compact />
        </section>
        <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold">我的方案</h2>
          {ownPlan ? (
            <WeekGrid sections={ownPlan.payload.sections} compact />
          ) : (
            <div className="text-sm text-slate-500">Select your plan.</div>
          )}
        </section>
      </div>

      <section className="rounded-xl border border-green-200 bg-green-50 p-4">
        <h2 className="mb-2 text-sm font-semibold text-green-800">共同空闲（≥30 分钟）</h2>
        {commonFree.length === 0 ? (
          <div className="text-sm text-green-700">No common free slot found.</div>
        ) : (
          <div className="grid gap-1 text-sm text-green-900 md:grid-cols-3">
            {commonFree.map((slot) => (
              <div key={`${slot.date}-${slot.start}-${slot.end}`}>
                {slot.date} {slot.start}–{slot.end}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
