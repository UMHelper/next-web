"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import AdminInfiniteScroll from "@/components/admin/admin-infinite-scroll";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Mapping = {
  id: number;
  course_id: string;
  prof_id: string;
  is_offered: number;
  admin_note: string | null;
  admin_note_en: string | null;
};

const PAGE_SIZE = 50;

export default function AdminCourseNotesClient() {
  const [q, setQ] = useState("");
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mappingTotal, setMappingTotal] = useState(0);
  const [mappingPage, setMappingPage] = useState(1);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [mappingsLoadingMore, setMappingsLoadingMore] = useState(false);
  const [editingMapping, setEditingMapping] = useState<Mapping | null>(null);
  const [mappingDraft, setMappingDraft] = useState<Partial<Mapping>>({});
  const mappingsRequestRef = useRef(0);

  const buildParams = useCallback((page: number) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (q.trim()) params.set("q", q.trim());
    return params.toString();
  }, [q]);

  const loadMappings = useCallback(async (targetPage: number, append: boolean) => {
    const requestId = ++mappingsRequestRef.current;
    if (append) setMappingsLoadingMore(true);
    else setLoadingMappings(true);

    try {
      const response = await fetch(`/api/admin/prof-with-course?${buildParams(targetPage)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Failed to load mappings");
      if (requestId !== mappingsRequestRef.current) return;

      const nextMappings = body.rows ?? [];
      setMappings((current) => (append ? [...current, ...nextMappings] : nextMappings));
      setMappingTotal(body.total ?? 0);
      setMappingPage(targetPage);
    } catch (error) {
      if (requestId === mappingsRequestRef.current) {
        toast.error(error instanceof Error ? error.message : "Failed to load mappings");
      }
    } finally {
      if (requestId === mappingsRequestRef.current) {
        if (append) setMappingsLoadingMore(false);
        else setLoadingMappings(false);
      }
    }
  }, [buildParams]);

  useEffect(() => {
    setMappings([]);
    setMappingPage(1);
    void loadMappings(1, false);
  }, [loadMappings]);

  const hasMoreMappings = mappings.length < mappingTotal;
  const loadMoreMappings = useCallback(() => {
    if (loadingMappings || mappingsLoadingMore || !hasMoreMappings) return;
    void loadMappings(mappingPage + 1, true);
  }, [loadMappings, mappingPage, loadingMappings, mappingsLoadingMore, hasMoreMappings]);

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
    const updated = body?.row as Mapping | undefined;
    if (updated) {
      setMappings((current) => current.map((mapping) => (
        mapping.id === updated.id ? { ...mapping, ...updated } : mapping
      )));
    }
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
    await loadMappings(mappingPage, false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-lg font-semibold">Professor mappings / course notes</div>
        <div className="flex gap-2">
          <Input
            className="w-56"
            placeholder="Course code or professor"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
          <Button variant="outline" onClick={() => void loadMappings(1, false)} disabled={loadingMappings}>
            Refresh
          </Button>
        </div>
      </div>

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
            {!loadingMappings && mappings.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-6 text-center text-gray-500">No course notes</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminInfiniteScroll
        canLoadMore={hasMoreMappings}
        loading={loadingMappings || mappingsLoadingMore}
        onLoadMore={loadMoreMappings}
      />

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
