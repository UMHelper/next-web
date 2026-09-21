"use client";

import React from "react";
import { X } from "lucide-react";

import type { PlanSection } from "@/lib/timetable/schema";

export default function SectionList({
  sections,
  conflictKeys,
  onRemove,
}: {
  sections: PlanSection[];
  conflictKeys: Set<string>;
  onRemove: (key: string) => void;
}) {
  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
        No courses yet. Add a course from a review page.
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {sections.map((section) => (
        <div
          key={section.key}
          className={`flex items-start justify-between rounded-lg border bg-white p-3 ${
            conflictKeys.has(section.key) ? "border-red-400" : "border-slate-200"
          }`}
        >
          <div>
            <div className="text-sm font-semibold">
              {section.courseCode}-{section.section}
            </div>
            <div className="text-xs text-slate-500">{section.prof}</div>
            <div className="mt-1 text-[11px] text-slate-500">
              {section.schedules.map((schedule) => (
                <div key={`${schedule.date}-${schedule.time}`}>
                  {schedule.date} {schedule.time}
                </div>
              ))}
            </div>
          </div>
          <button
            type="button"
            aria-label={`Remove ${section.courseCode}`}
            onClick={() => onRemove(section.key)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
