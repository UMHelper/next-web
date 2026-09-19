"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
  courseTitleEng: string;
  courseTitleChi: string;
  Credits: string;
  Offering_Department: string;
  Offering_Unit: string;
  Medium_of_Instruction: string;
  Is_Offered: number;
  courseDescription: string | null;
  ilo: string | null;
};

type Mapping = {
  id: number;
  course_id: string;
  prof_id: string;
  is_offered: number;
};

export default function AdminCoursesClient() {
  const [q, setQ] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Course | null>(null);
  const [draft, setDraft] = useState<Partial<Course>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (q.trim()) params.set("q", q.trim());
      const suffix = params.toString();
      const [coursesResponse, mappingsResponse] = await Promise.all([
        fetch(`/api/admin/courses?${suffix}`),
        fetch(`/api/admin/prof-with-course?${suffix}`),
      ]);
      const coursesBody = await coursesResponse.json();
      const mappingsBody = await mappingsResponse.json();
      if (!coursesResponse.ok) throw new Error(coursesBody?.error?.message ?? "Failed to load courses");
      if (!mappingsResponse.ok) throw new Error(mappingsBody?.error?.message ?? "Failed to load mappings");
      setCourses(coursesBody.courses ?? []);
      setMappings(mappingsBody.rows ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load course data");
    } finally {
      setLoading(false);
    }
  }, [q]);

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
        Offering_Department: draft.Offering_Department,
        Offering_Unit: draft.Offering_Unit,
        Medium_of_Instruction: draft.Medium_of_Instruction,
        Is_Offered: draft.Is_Offered,
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
          <div className="text-lg font-semibold">Courses</div>
          <div className="flex gap-2">
            <Input className="w-56" placeholder="Code or title" value={q} onChange={(e) => setQ(e.target.value)} />
            <Button variant="outline" onClick={load} disabled={loading}>Refresh</Button>
            <Button onClick={syncUm}>Sync UM (10)</Button>
          </div>
        </div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b text-gray-500">
                <th className="p-3">Code</th>
                <th className="p-3">Title</th>
                <th className="p-3">Credits</th>
                <th className="p-3">Unit / Dept</th>
                <th className="p-3">Offered</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => (
                <tr key={course.New_code} className="border-b last:border-0">
                  <td className="p-3 font-mono">{course.New_code}</td>
                  <td className="p-3">{course.courseTitleEng}</td>
                  <td className="p-3">{course.Credits}</td>
                  <td className="p-3">{course.Offering_Unit} / {course.Offering_Department}</td>
                  <td className="p-3">{course.Is_Offered === 1 ? "Yes" : "No"}</td>
                  <td className="p-3">
                    <Button size="xs" variant="outline" onClick={() => openEdit(course)}>Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <div className="text-lg font-semibold">Professor mappings</div>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50">
              <tr className="border-b text-gray-500">
                <th className="p-3">Course</th>
                <th className="p-3">Professor</th>
                <th className="p-3">Offered</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id} className="border-b last:border-0">
                  <td className="p-3 font-mono">{mapping.course_id}</td>
                  <td className="p-3">{mapping.prof_id}</td>
                  <td className="p-3">{mapping.is_offered === 1 ? "Yes" : "No"}</td>
                  <td className="p-3">
                    <Button size="xs" variant="outline" onClick={() => toggleMapping(mapping)}>
                      Toggle offered
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            <Input value={draft.Offering_Unit ?? ""} onChange={(e) => setDraft({ ...draft, Offering_Unit: e.target.value })} placeholder="Offering unit" />
            <Input value={draft.Offering_Department ?? ""} onChange={(e) => setDraft({ ...draft, Offering_Department: e.target.value })} placeholder="Department" />
            <Input value={draft.Medium_of_Instruction ?? ""} onChange={(e) => setDraft({ ...draft, Medium_of_Instruction: e.target.value })} placeholder="Medium" />
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
