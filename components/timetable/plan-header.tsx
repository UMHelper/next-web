"use client";

import React, { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import ShareDialog from "@/components/timetable/share-dialog";
import type { LocalPlan } from "@/lib/timetable/store";

export default function PlanHeader({
  plans,
  activePlan,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}: {
  plans: LocalPlan[];
  activePlan: LocalPlan;
  onSelect: (clientRef: string) => void;
  onCreate: () => void;
  onRename: (clientRef: string, name: string) => void;
  onDelete: (clientRef: string) => void;
}) {
  const [name, setName] = useState(activePlan.name);

  useEffect(() => {
    setName(activePlan.name);
  }, [activePlan.clientRef, activePlan.name]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        <select
          aria-label="Select timetable plan"
          value={activePlan.clientRef}
          onChange={(event) => onSelect(event.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        >
          {plans.map((plan) => (
            <option key={plan.clientRef} value={plan.clientRef}>
              {plan.name}
            </option>
          ))}
        </select>
        <input
          aria-label="Plan name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => onRename(activePlan.clientRef, name.trim() || activePlan.name)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm font-semibold"
        />
        <span className="text-xs text-slate-500">
          {activePlan.year} Sem {activePlan.sem}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <ShareDialog plan={activePlan} />
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white"
        >
          <Plus size={14} /> New plan
        </button>
        <button
          type="button"
          aria-label="Delete plan"
          onClick={() => {
            if (window.confirm(`Delete ${activePlan.name}?`)) {
              onDelete(activePlan.clientRef);
            }
          }}
          className="rounded-md border border-red-200 p-2 text-red-600"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}
