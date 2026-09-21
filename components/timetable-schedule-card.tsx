"use client";

import React from "react";
import Link from "next/link";
import { CalendarPlus, ShoppingCart } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import { normalizePlanSection } from "@/lib/timetable/schema";

const currentTerm = () => ({
  year: Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026),
  sem: Number(process.env.NEXT_PUBLIC_CURRENT_SEM ?? 1),
});

export const TimetableScheduleCard = ({
  timetable,
  code,
  prof,
  courseTitle,
  credits,
}: {
  timetable: any;
  code: string;
  prof: string;
  courseTitle?: string;
  credits?: number;
}) => {
  const { activePlan, addSection, replaceSection, createPlan } = useTimetablePlanner();

  if (timetable === undefined || timetable.length === 0) {
    return (
      <div className="space-y-2 text-sm">
        <div>No schedule information found.</div>
        <div className="text-xs">
          Please refer to the official documents of the{" "}
          <span className="underline">
            <Link href="https://reg.um.edu.mo">Registry</Link>
          </span>
          .
        </div>
      </div>
    );
  }

  const decodedProf = decodeURIComponent(prof).replaceAll("%20", " ").replaceAll("$", "/");

  return (
    <div className="space-y-4">
      {timetable.map((scheduleEntry: any) => {
        const section = normalizePlanSection({
          code,
          courseTitle,
          prof: decodedProf,
          section: scheduleEntry.section,
          credits,
          schedules: scheduleEntry.schedules,
        });
        const existing = activePlan?.payload.sections.find(
          (item) => item.key === section.key,
        );
        const sameCourse = activePlan?.payload.sections.find(
          (item) => item.courseCode === section.courseCode && item.key !== section.key,
        );

        const add = () => {
          const plan = activePlan ?? createPlan("我的课表", currentTerm());
          if (existing) {
            toast.info("This section is already in your timetable.");
            return;
          }
          if (sameCourse) {
            replaceSection(plan.clientRef, sameCourse.key, section);
            toast.success(`Replaced ${sameCourse.courseCode} with section ${section.section}.`);
            return;
          }
          const result = addSection(plan.clientRef, section);
          if (result.ok) toast.success(`Added ${section.courseCode}-${section.section}.`);
          else if (result.error === "same-course") {
            toast.error("Another section of this course is already in your timetable.");
          } else {
            toast.error("Unable to add this section.");
          }
        };

        return (
          <div key={scheduleEntry.section}>
            <div className="rounded bg-slate-100 p-1 text-base">
              Section {scheduleEntry.section}
            </div>
            <div className="py-2">
              {scheduleEntry.schedules.map((schedule: any) => (
                <div
                  className="grid grid-cols-3 px-1 py-1 text-sm"
                  key={`${schedule.date}-${schedule.time}-${schedule.location}`}
                >
                  <div>{schedule.date}</div>
                  <div>{schedule.time}</div>
                  <div>{schedule.location}</div>
                </div>
              ))}
            </div>
            <Button
              size="xs"
              disabled={Boolean(existing)}
              onClick={add}
              className="bg-gradient-to-r from-purple-600 to-blue-600 text-slate-100 hover:from-purple-500 hover:to-blue-500 hover:shadow"
            >
              {existing ? (
                <>
                  <ShoppingCart size={14} className="m-1" /> Added
                </>
              ) : (
                <>
                  <CalendarPlus size={14} className="m-1" /> Add to Timetable
                </>
              )}
            </Button>
          </div>
        );
      })}
      <div className="text-xs italic text-gray-500">Data Source: reg.um.edu.mo</div>
    </div>
  );
};

export default TimetableScheduleCard;
