"use client";

import React, { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTimetablePlanner } from "@/components/timetable/planner-provider";
import {
  getCourseDetail,
  getInstructorCourses,
  getSections,
} from "@/lib/timetable/catalog-client";
import { useCatalogSearch } from "@/lib/timetable/use-catalog-search";
import { normalizePlanSection, type PlanSection } from "@/lib/timetable/schema";

type Mode = "course" | "instructor";

const currentTerm = () => ({
  year: Number(process.env.NEXT_PUBLIC_CURRENT_YEAR ?? 2026),
  sem: Number(process.env.NEXT_PUBLIC_CURRENT_SEM ?? 1),
});

export default function PlannerSidebar() {
  const [mode, setMode] = useState<Mode>("course");
  const [q, setQ] = useState("");
  const [faculty, setFaculty] = useState("");
  const [department, setDepartment] = useState("");
  const [filters, setFilters] = useState<{ faculties: string[]; departments: string[] }>({
    faculties: [],
    departments: [],
  });
  const [detail, setDetail] = useState<any>(null);
  const [sections, setSections] = useState<Array<{ section: string; schedules: PlanSection["schedules"] }>>([]);
  const [selectedProf, setSelectedProf] = useState("");
  const [instructorCourses, setInstructorCourses] = useState<any[]>([]);
  const { items, loading, error } = useCatalogSearch({
    type: mode,
    q,
    faculty,
    department,
  });
  const { activePlan, addSection, replaceSection, createPlan } = useTimetablePlanner();

  useEffect(() => {
    void fetch("/api/timetable/catalog/filters")
      .then((response) => response.json())
      .then((body) => setFilters(body))
      .catch(() => undefined);
  }, []);

  const add = (entry: { section: string; schedules: PlanSection["schedules"] }, code: string, prof: string, course: any) => {
    const section = normalizePlanSection({
      code,
      courseTitle: course?.courseTitle,
      prof,
      section: entry.section,
      credits: Number(course?.credits ?? 0) || undefined,
      schedules: entry.schedules,
    });
    const plan = activePlan ?? createPlan("我的课表", currentTerm());
    const existing = plan.payload.sections.find((item) => item.key === section.key);
    if (existing) {
      toast.info("This section is already in your timetable.");
      return;
    }
    const sameCourse = plan.payload.sections.find(
      (item) => item.courseCode === section.courseCode && item.key !== section.key,
    );
    if (sameCourse) {
      replaceSection(plan.clientRef, sameCourse.key, section);
      toast.success(`Replaced ${section.courseCode} with section ${section.section}.`);
      return;
    }
    const result = addSection(plan.clientRef, section);
    if (result.ok) toast.success(`Added ${section.courseCode}-${section.section}.`);
    else toast.error("Unable to add this section.");
  };

  const openCourse = async (code: string) => {
    setSelectedProf("");
    setSections([]);
    const courseDetail = await getCourseDetail(code);
    setDetail(courseDetail);
  };

  const openSections = async (code: string, prof: string) => {
    setSelectedProf(prof);
    const result = await getSections(code, prof);
    setSections(result.sections ?? []);
  };

  const openInstructor = async (prof: string) => {
    setDetail(null);
    setSections([]);
    setSelectedProf(prof);
    const result = await getInstructorCourses(prof);
    setInstructorCourses(result.courses ?? []);
  };

  return (
    <aside className="w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4 lg:w-[420px]">
      <div className="flex rounded-md border border-slate-200 p-1 text-sm">
        {(["course", "instructor"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setDetail(null);
              setSections([]);
              setSelectedProf("");
            }}
            className={`flex-1 rounded px-2 py-1 ${
              mode === value ? "bg-blue-600 text-white" : "text-slate-600"
            }`}
          >
            {value === "course" ? "Course" : "Instructor"}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-2.5 text-slate-400" size={14} />
          <input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setDetail(null);
              setSections([]);
            }}
            placeholder={mode === "course" ? "Course code or title" : "Instructor name"}
            className="w-full rounded-md border border-slate-200 py-2 pl-7 pr-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <select
          aria-label="Faculty"
          value={faculty}
          onChange={(event) => {
            setFaculty(event.target.value);
            setDepartment("");
          }}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="">All faculties</option>
          {filters.faculties.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <select
          aria-label="Department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm"
        >
          <option value="">All departments</option>
          {filters.departments.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="text-xs text-slate-500">Searching...</div>}
      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="max-h-[420px] space-y-2 overflow-auto">
        {items.map((item: any) =>
          mode === "course" ? (
            <button
              key={item.course_code}
              type="button"
              onClick={() => void openCourse(item.course_code)}
              className="w-full rounded-md border border-slate-100 p-2 text-left text-sm hover:bg-slate-50"
            >
              <div className="font-semibold">{item.course_code}</div>
              <div className="text-xs text-slate-500">{item.course_title_eng}</div>
            </button>
          ) : (
            <button
              key={item.prof_id}
              type="button"
              onClick={() => void openInstructor(item.prof_id)}
              className="w-full rounded-md border border-slate-100 p-2 text-left text-sm hover:bg-slate-50"
            >
              <div className="font-semibold">{item.prof_id}</div>
              <div className="text-xs text-slate-500">{item.course_count} courses</div>
            </button>
          ),
        )}
      </div>

      {detail && (
        <div className="rounded-md border border-slate-100 p-2">
          <div className="text-sm font-semibold">{detail.course?.courseCode}</div>
          <div className="text-xs text-slate-500">{detail.course?.courseTitle}</div>
          <div className="mt-2 space-y-1">
            {(detail.profList ?? []).map((prof: any) => (
              <button
                key={prof.prof_id}
                type="button"
                onClick={() => void openSections(detail.course?.courseCode, prof.prof_id)}
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
              >
                {prof.prof_id}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "instructor" && instructorCourses.length > 0 && (
        <div className="rounded-md border border-slate-100 p-2">
          <div className="text-xs font-semibold">{selectedProf}</div>
          <div className="mt-1 space-y-1">
            {instructorCourses.map((course: any) => (
              <button
                key={course.New_code ?? course.course_id}
                type="button"
                onClick={() =>
                  void openSections(course.New_code ?? course.course_id, selectedProf)
                }
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
              >
                {course.New_code ?? course.course_id}
              </button>
            ))}
          </div>
        </div>
      )}

      {sections.length > 0 && detail && (
        <div className="space-y-2 rounded-md border border-slate-100 p-2">
          <div className="text-xs font-semibold">
            {detail.course?.courseCode} · {selectedProf}
          </div>
          {sections.map((entry) => (
            <div key={entry.section} className="rounded border border-slate-100 p-2 text-xs">
              <div className="font-semibold">Section {entry.section}</div>
              {entry.schedules.map((schedule) => (
                <div key={`${schedule.date}-${schedule.time}`}>
                  {schedule.date} {schedule.time} · {schedule.location}
                </div>
              ))}
              <Button
                size="xs"
                className="mt-2"
                onClick={() =>
                  add(entry, detail.course?.courseCode, selectedProf, detail.course)
                }
              >
                Add to Timetable
              </Button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
