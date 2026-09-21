"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import AdminInfiniteScroll from "@/components/admin/admin-infinite-scroll";
import { AdminTableRowsSkeleton } from "@/components/loading-skeletons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Course = {
  New_code: string;
  Old_code: string;
  courseTitleEng: string;
  courseTitleChi: string;
  Credits: string;
  Course_Duration: string;
  Offering_Department: string;
  Offering_Unit: string;
  Medium_of_Instruction: string;
  Is_Offered: number;
  offeringProgLevel: string | null;
  courseType: string | null;
  suggestedYearOfStudy: number | null;
  gradingSystem: string | null;
  courseDescription: string | null;
  ilo: string | null;
};

const PAGE_SIZE = 50;

export default function AdminCoursesClient() {
  const [q, setQ] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseTotal, setCourseTotal] = useState(0);
  const [coursePage, setCoursePage] = useState(1);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [coursesLoadingMore, setCoursesLoadingMore] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [draft, setDraft] = useState<Partial<Course>>({});
  const coursesRequestRef = useRef(0);

  const buildParams = useCallback((page: number) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    return params.toString();
  }, [q]);

  const loadCourses = useCallback(async (targetPage: number, append: boolean) => {
    const requestId = ++coursesRequestRef.current;
    if (append) setCoursesLoadingMore(true);
    else setLoadingCourses(true);

    try {
      const response = await fetch(`/api/admin/courses?${buildParams(targetPage)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Failed to load courses");
      if (requestId !== coursesRequestRef.current) return;

      const nextCourses = body.courses ?? [];
      setCourses((current) => (append ? [...current, ...nextCourses] : nextCourses));
      setCourseTotal(body.total ?? 0);
      setCoursePage(targetPage);
    } catch (error) {
      if (requestId === coursesRequestRef.current) {
        toast.error(error instanceof Error ? error.message : "Failed to load courses");
      }
    } finally {
      if (requestId === coursesRequestRef.current) {
        if (append) setCoursesLoadingMore(false);
        else setLoadingCourses(false);
      }
    }
  }, [buildParams]);

  useEffect(() => {
    setCourses([]);
    setCoursePage(1);
    void loadCourses(1, false);
  }, [loadCourses]);

  const hasMoreCourses = courses.length < courseTotal;
  const loadMoreCourses = useCallback(() => {
    if (loadingCourses || coursesLoadingMore || !hasMoreCourses) return;
    void loadCourses(coursePage + 1, true);
  }, [loadCourses, coursePage, loadingCourses, coursesLoadingMore, hasMoreCourses]);

  function openEdit(course: Course) {
    setEditing(course);
    setDraft(course);
  }

  async function saveCourse() {
    if (!editing) return;
    const response = await fetch(`/api/admin/courses/${editing.New_code}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseTitleEng: draft.courseTitleEng,
        courseTitleChi: draft.courseTitleChi || null,
        Credits: draft.Credits,
        Course_Duration: draft.Course_Duration,
        Offering_Department: draft.Offering_Department,
        Offering_Unit: draft.Offering_Unit,
        Medium_of_Instruction: draft.Medium_of_Instruction,
        Is_Offered: draft.Is_Offered,
        offeringProgLevel: draft.offeringProgLevel || null,
        courseType: draft.courseType || null,
        suggestedYearOfStudy: draft.suggestedYearOfStudy === null || draft.suggestedYearOfStudy === undefined
          ? null
          : Number(draft.suggestedYearOfStudy),
        gradingSystem: draft.gradingSystem || null,
        courseDescription: draft.courseDescription || null,
        ilo: draft.ilo || null,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(body?.error?.message ?? "Failed to update course");
      return;
    }
    toast.success("Course updated");
    setEditing(null);
    const updated = body?.course as Course | undefined;
    if (updated) {
      setCourses((current) => current.map((course) => (
        course.New_code === updated.New_code ? { ...course, ...updated } : course
      )));
    }
  }

  async function syncUm() {
    const response = await fetch("/api/admin/sync-um", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "missing", limit: 10 }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(body?.error?.message ?? "UM sync failed");
      return;
    }
    toast.success(`UM sync: ${body.stats.updated} updated, ${body.stats.failed} failed`);
    await loadCourses(coursePage, false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-semibold">Courses</div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Input className="w-full sm:w-56" placeholder="Code or title" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button className="flex-1 sm:flex-none" variant="outline" onClick={() => void loadCourses(1, false)} disabled={loadingCourses}>
            Refresh
          </Button>
          <Button className="flex-1 sm:flex-none" onClick={syncUm}>Sync UM (10)</Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1050px] text-left text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b text-gray-500">
              <th className="p-3">Code</th>
              <th className="p-3">English title</th>
              <th className="p-3">Chinese title</th>
              <th className="p-3">Credits / Duration</th>
              <th className="p-3">Unit / Dept</th>
              <th className="p-3">Medium</th>
              <th className="p-3">Level / Type</th>
              <th className="p-3">Offered</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loadingCourses && courses.length === 0 ? <AdminTableRowsSkeleton columns={9} rows={6} /> : null}
            {courses.map((course) => (
              <tr key={course.New_code} className="border-b last:border-0">
                <td className="p-3 font-mono">
                  {course.New_code}
                  {course.Old_code ? <div className="text-xs text-gray-400">{course.Old_code}</div> : null}
                </td>
                <td className="p-3">{course.courseTitleEng}</td>
                <td className="p-3 text-xs">{course.courseTitleChi || "-"}</td>
                <td className="p-3 text-xs">{course.Credits} / {course.Course_Duration || "-"}</td>
                <td className="p-3 text-xs">{course.Offering_Unit} / {course.Offering_Department}</td>
                <td className="p-3 text-xs">{course.Medium_of_Instruction}</td>
                <td className="p-3 text-xs">
                  <div>{course.offeringProgLevel ?? "-"}</div>
                  <div className="text-gray-500">
                    {[course.courseType, course.suggestedYearOfStudy ? `Year ${course.suggestedYearOfStudy}` : null]
                      .filter(Boolean)
                      .join(" · ") || "-"}
                  </div>
                </td>
                <td className="p-3">{course.Is_Offered === 1 ? "Yes" : "No"}</td>
                <td className="p-3">
                  <Button size="xs" variant="outline" onClick={() => openEdit(course)}>Edit</Button>
                </td>
              </tr>
            ))}
            {!loadingCourses && courses.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500">No courses</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminInfiniteScroll
        canLoadMore={hasMoreCourses}
        loading={loadingCourses || coursesLoadingMore}
        onLoadMore={loadMoreCourses}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit {editing?.New_code}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={draft.courseTitleEng ?? ""} onChange={(e) => setDraft({ ...draft, courseTitleEng: e.target.value })} placeholder="English title" />
            <Input value={draft.courseTitleChi ?? ""} onChange={(e) => setDraft({ ...draft, courseTitleChi: e.target.value })} placeholder="Chinese title" />
            <Input value={draft.Credits ?? ""} onChange={(e) => setDraft({ ...draft, Credits: e.target.value })} placeholder="Credits" />
            <Input value={draft.Course_Duration ?? ""} onChange={(e) => setDraft({ ...draft, Course_Duration: e.target.value })} placeholder="Course duration" />
            <Input value={draft.Offering_Unit ?? ""} onChange={(e) => setDraft({ ...draft, Offering_Unit: e.target.value })} placeholder="Offering unit" />
            <Input value={draft.Offering_Department ?? ""} onChange={(e) => setDraft({ ...draft, Offering_Department: e.target.value })} placeholder="Department" />
            <Input value={draft.Medium_of_Instruction ?? ""} onChange={(e) => setDraft({ ...draft, Medium_of_Instruction: e.target.value })} placeholder="Medium" />
            <Input value={draft.offeringProgLevel ?? ""} onChange={(e) => setDraft({ ...draft, offeringProgLevel: e.target.value })} placeholder="Programme level" />
            <Input value={draft.courseType ?? ""} onChange={(e) => setDraft({ ...draft, courseType: e.target.value })} placeholder="Course type" />
            <Input
              type="number"
              value={draft.suggestedYearOfStudy ?? ""}
              onChange={(e) => setDraft({
                ...draft,
                suggestedYearOfStudy: e.target.value === "" ? null : Number(e.target.value),
              })}
              placeholder="Suggested year"
            />
            <Input value={draft.gradingSystem ?? ""} onChange={(e) => setDraft({ ...draft, gradingSystem: e.target.value })} placeholder="Grading system" />
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={draft.Is_Offered === 1} onCheckedChange={(checked) => setDraft({ ...draft, Is_Offered: checked ? 1 : 0 })} />
              <span className="text-sm">Is offered</span>
            </div>
            <Textarea className="sm:col-span-2" value={draft.courseDescription ?? ""} onChange={(e) => setDraft({ ...draft, courseDescription: e.target.value })} placeholder="Course description" />
            <Textarea className="sm:col-span-2" value={draft.ilo ?? ""} onChange={(e) => setDraft({ ...draft, ilo: e.target.value })} placeholder="ILO" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveCourse}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
