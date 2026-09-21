"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";

import { detectScheduleConflicts, timeToMinutes } from "@/lib/timetable/conflicts";
import type { PlanSection } from "@/lib/timetable/schema";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI"] as const;
const START_MINUTES = 8 * 60;
const TOTAL_MINUTES = 12 * 60;

export default function WeekGrid({
  sections,
  compact = false,
}: {
  sections: PlanSection[];
  compact?: boolean;
}) {
  const router = useRouter();
  const conflictKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const conflict of detectScheduleConflicts(sections)) {
      keys.add(conflict.a.key);
      keys.add(conflict.b.key);
    }
    return keys;
  }, [sections]);

  const pixelsPerHour = compact ? 40 : 60;
  const gridHeight = (TOTAL_MINUTES / 60) * pixelsPerHour;

  return (
    <div className={compact ? "min-w-[560px]" : "min-w-[720px]"}>
      <div className="grid grid-cols-5 border-b border-slate-200 text-center text-xs font-semibold text-slate-500">
        {DAYS.map((day) => (
          <div key={day} className="py-2">
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5" style={{ height: gridHeight }}>
        {DAYS.map((day) => (
          <div key={day} className="relative border-l border-slate-100">
            {sections.flatMap((section) =>
              section.schedules
                .filter((schedule) => schedule.date === day)
                .map((schedule, index) => {
                  const [start, end] = schedule.time.split("-");
                  const startMinutes = timeToMinutes(start) - START_MINUTES;
                  const endMinutes = timeToMinutes(end) - START_MINUTES;
                  const top = (startMinutes / 60) * pixelsPerHour;
                  const height = Math.max(
                    ((endMinutes - startMinutes) / 60) * pixelsPerHour,
                    compact ? 18 : 28,
                  );
                  const conflict = conflictKeys.has(section.key);

                  return (
                    <div
                      key={`${section.key}-${schedule.date}-${schedule.time}-${index}`}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        router.push(`/reviews/${section.courseCode}/${section.prof}`)
                      }
                      className={[
                        "absolute left-1 right-1 overflow-hidden rounded px-1 py-0.5 text-left text-white shadow-sm",
                        conflict ? "border-2 border-red-500" : "",
                      ].join(" ")}
                      style={{
                        top,
                        height,
                        backgroundColor: section.color,
                      }}
                    >
                      <div className="truncate text-[10px] font-semibold">
                        {section.courseCode}-{section.section}
                      </div>
                      {!compact && (
                        <div className="truncate text-[9px]">
                          {schedule.time}
                          {schedule.location ? ` · ${schedule.location}` : ""}
                        </div>
                      )}
                    </div>
                  );
                }),
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
