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
      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No courses yet. Add a course from a review page.
      </div>
    );
  }

  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
      {sections.map((section) => (
        <div
          key={section.key}
          className={`flex items-start justify-between rounded-lg border bg-background p-3 ${
            conflictKeys.has(section.key) ? "border-destructive-strong" : "border-border"
          }`}
        >
          <div>
            <div className="text-sm font-semibold">
              {section.courseCode}-{section.section}
            </div>
            <div className="text-xs text-muted-foreground">{section.prof}</div>
            <div className="mt-1 text-[11px] text-muted-foreground">
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
            className="rounded p-1 text-foreground-subtle hover:bg-muted"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
