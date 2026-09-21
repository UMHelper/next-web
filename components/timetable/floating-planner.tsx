"use client";

import React, { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { usePathname } from "next/navigation";

import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import WeekGrid from "@/components/timetable/week-grid";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { detectScheduleConflicts } from "@/lib/timetable/conflicts";

const FloatingPlanner = () => {
  const pathname = usePathname();
  const { activePlan, syncState } = useTimetablePlanner();
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  if (pathname.startsWith("/timetable") || pathname.startsWith("/compare")) {
    return null;
  }

  const sections = activePlan?.payload.sections ?? [];
  const conflictCount = detectScheduleConflicts(sections).length;

  return (
    <>
      <button
        type="button"
        aria-label="Open timetable preview"
        aria-expanded={desktopOpen}
        onClick={() => setDesktopOpen((value) => !value)}
        className="fixed right-0 top-1/2 z-40 hidden -translate-y-1/2 items-center gap-2 rounded-l-xl border border-r-0 border-slate-200 bg-white px-2 py-3 text-slate-700 shadow-lg md:flex"
      >
        <CalendarDays size={18} />
        <span className="text-xs font-semibold">{sections.length}</span>
        {conflictCount > 0 && (
          <span className="rounded-full bg-red-500 px-1.5 text-[10px] text-white">
            {conflictCount}
          </span>
        )}
      </button>

      {desktopOpen && (
        <aside className="fixed right-4 top-1/2 z-40 hidden max-h-[70vh] w-[400px] -translate-y-1/2 overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-2xl md:block">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">My Timetable</div>
              <div className="text-xs text-slate-500">
                {syncState === "saving" ? "Saving..." : activePlan?.name ?? "No plan yet"}
              </div>
            </div>
            <button
              type="button"
              aria-label="Close timetable preview"
              onClick={() => setDesktopOpen(false)}
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
            >
              <X size={16} />
            </button>
          </div>
          {activePlan ? (
            <WeekGrid sections={sections} compact />
          ) : (
            <div className="rounded border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
              Add courses to build your timetable.
            </div>
          )}
        </aside>
      )}

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-lg md:hidden"
      >
        <CalendarDays size={16} />
        {sections.length} classes · {conflictCount} conflicts
      </button>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="bottom" className="max-h-[80vh] bg-white">
          <SheetHeader>
            <SheetTitle>My Timetable</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {activePlan ? (
              <WeekGrid sections={sections} compact />
            ) : (
              <div className="rounded border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                Add courses to build your timetable.
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default FloatingPlanner;
