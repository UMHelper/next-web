"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import AdminPagination from "@/components/admin/admin-pagination";
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

type Mapping = {
  id: number;
  course_id: string;
  prof_id: string;
  is_offered: number;
  admin_note: string | null;
  admin_note_en: string | null;
};

const PAGE_SIZE = 50;

export default function AdminCoursesClient() {
  const [q, setQ] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [courseTotal, setCourseTotal] = useState(0);
  const [mappingTotal, setMappingTotal] = useState(0);
  const [coursePage, setCoursePage] = useState(1);
  const [mappingPage, setMappingPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Course | null>(null);
  const [draft, setDraft] = useState<Partial<Course>>({});
  const [editingMapping, setEditingMapping] = useState<Mapping | null>(null);
  const [mappingDraft, setMappingDraft] = useState<Partial<Mapping>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const buildParams = (page: number) => {
        const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
        if (q.trim()) params.set("q", q.trim());
        return params.toString();
      };
      const [coursesResponse, mappingsResponse] = await Promise.all([
        fetch(`/api/admin/courses?${buildParams(coursePage)}`),
        fetch(`/api/admin/prof-with-course?${buildParams(mappingPage)}`),
      ]);
      const coursesBody = await coursesResponse.json();
      const mappingsBody = await mappingsResponse.json();
      if (!coursesResponse.ok) throw new Error(coursesBody?.error?.message ?? "Failed to load courses");
      if (!mappingsResponse.ok) throw new Error(mappingsBody?.error?.message ?? "Failed to load mappings");
      setCourses(coursesBody.courses ?? []);
      setCourseTotal(coursesBody.total ?? 0);
      setMappings(mappingsBody.rows ?? []);
      setMappingTotal(mappingsBody.total ?? 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load course data");
    } finally {
      setLoading(false);
    }
  }, [q, coursePage, mappingPage]);

  useEffect(() => {
    void load();
  }, [load]);

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
    await load();
  }

  function openMappingEdit(mapping: Mapping) {
    setEditingMapping(mapping);
    setMappingDraft(mapping);
  }

  async function saveMapping() {
    if (!editingMapping) return;
    const response = await fetch(`/api/admin/prof-with-course/${editingMapping.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_note: mappingDraft.admin_note?.trim() || null,
        admin_note_en: mappingDraft.admin_note_en?.trim() || null,
      }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(body?.error?.message ?? "Failed to update notes");
      return;
    }
    toast.success("Notes updated");
    setEditingMapping(null);
    await load();
  }

  async function toggleMapping(mapping: Mapping) {
    const response = await fetch(`/api/admin/prof-with-course/${mapping.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_offered: mapping.is_offered === 1 ? 0 : 1 }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(body?.error?.message ?? "Failed to update mapping");
      return;
    }
    toast.success("Mapping updated");
    await load();
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
    await load();
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="text-lg font-semibold">Courses & notes</div>
          <div className="flex gap-2">
            <Input className="w-56" placeholder="Code or title" value={q} onChange={(e) => { setQ(e.target.value); setCoursePage(1); setMappingPage(1); }} />
            <Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>
            <Button onClick={syncUm}>Sync UM (10)</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
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
              {!loading && courses.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-gray-500">No courses</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <AdminPagination
          page={coursePage}
          limit={PAGE_SIZE}
          total={courseTotal}
          loading={loading}
          onPageChange={setCoursePage}
        />
      </div>

      <div className="space-y-4">
        <div className="text-lg font-semibold">Professor mappings / course notes</div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b text-gray-500">
                <th className="p-3">Course</th>
                <th className="p-3">Professor</th>
                <th className="p-3">Notes</th>
                <th className="p-3">Offered</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id} className="border-b last:border-0">
                  <td className="p-3 font-mono">{mapping.course_id}</td>
                  <td className="p-3">{mapping.prof_id}</td>
                  <td className="max-w-[360px] p-3 align-top">
                    <div className="line-clamp-2 text-xs text-gray-700">
                      {mapping.admin_note_en || mapping.admin_note || "-"}
                    </div>
                    {mapping.admin_note_en && mapping.admin_note ? (
                      <div className="mt-1 line-clamp-1 text-xs text-gray-400">{mapping.admin_note}</div>
                    ) : null}
                  </td>
                  <td className="p-3">{mapping.is_offered === 1 ? "Yes" : "No"}</td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="xs" onClick={() => openMappingEdit(mapping)}>
                        Edit notes
                      </Button>
                      <Button size="xs" variant="outline" onClick={() => toggleMapping(mapping)}>
                        Toggle offered
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AdminPagination
          page={mappingPage}
          limit={PAGE_SIZE}
          total={mappingTotal}
          loading={loading}
          onPageChange={setMappingPage}
        />
      </div>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
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

      <Dialog open={editingMapping !== null} onOpenChange={(open) => !open && setEditingMapping(null)}>
        <DialogContent className="sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              Edit notes for {editingMapping?.course_id} / {editingMapping?.prof_id}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea
              className="min-h-28"
              value={mappingDraft.admin_note_en ?? ""}
              onChange={(e) => setMappingDraft({ ...mappingDraft, admin_note_en: e.target.value })}
              placeholder="English note (admin_note_en)"
            />
            <Textarea
              className="min-h-28"
              value={mappingDraft.admin_note ?? ""}
              onChange={(e) => setMappingDraft({ ...mappingDraft, admin_note: e.target.value })}
              placeholder="Chinese note (admin_note)"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMapping(null)}>Cancel</Button>
            <Button onClick={saveMapping}>Save notes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
