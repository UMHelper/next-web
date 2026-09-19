"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import AdminInfiniteScroll from "@/components/admin/admin-infinite-scroll";
import { CommentContent } from "@/components/comment-content";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Comment = {
  id: number;
  content: string | null;
  content_en: string | null;
  img: string | null;
  hidden: number;
  course_id: number;
  course_code: string | null;
  prof_id: string | null;
  replyto: number | null;
  upvote: number;
  downvote: number;
  verify: number;
  verify_account: string;
  pub_time: string;
};

const PAGE_SIZE = 50;

export default function AdminCommentsClient() {
  const [comments, setComments] = useState<Comment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [hidden, setHidden] = useState("all");
  const [editing, setEditing] = useState<Comment | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [draftContentEn, setDraftContentEn] = useState("");
  const [draftImg, setDraftImg] = useState("");
  const [draftHidden, setDraftHidden] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const requestIdRef = useRef(0);

  const loadPage = useCallback(async (targetPage: number, append: boolean) => {
    const requestId = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(targetPage) });
      if (q.trim()) params.set("q", q.trim());
      if (code.trim()) params.set("code", code.trim());
      if (hidden !== "all") params.set("hidden", hidden);
      const response = await fetch(`/api/admin/comments?${params.toString()}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      if (requestId !== requestIdRef.current) return;

      const nextComments = body.comments ?? [];
      setComments((current) => (append ? [...current, ...nextComments] : nextComments));
      setTotal(body.total ?? 0);
      setPage(targetPage);
    } catch (error) {
      if (requestId === requestIdRef.current) {
        toast.error(error instanceof Error ? error.message : "Failed to load comments");
      }
    } finally {
      if (requestId === requestIdRef.current) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  }, [q, code, hidden]);

  useEffect(() => {
    setComments([]);
    setPage(1);
    void loadPage(1, false);
  }, [loadPage]);

  const hasMore = comments.length < total;
  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    void loadPage(page + 1, true);
  }, [loadPage, page, loading, loadingMore, hasMore]);

  function openEdit(comment: Comment) {
    setEditing(comment);
    setDraftContent(comment.content ?? "");
    setDraftContentEn(comment.content_en ?? "");
    setDraftImg(comment.img ?? "");
    setDraftHidden(comment.hidden === 1);
  }

  async function saveEdit() {
    if (!editing) return;

    const patch: Record<string, unknown> = {
      content: draftContent,
      content_en: draftContentEn || null,
      img: draftImg || null,
      hidden: draftHidden ? 1 : 0,
    };

    try {
      const response = await fetch(`/api/admin/comments/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error?.message ?? `HTTP ${response.status}`);
      toast.success("Comment updated");
      setEditing(null);
      const updated = body?.comment;
      if (updated) {
        setComments((current) => current.map((comment) => (
          comment.id === updated.id ? { ...comment, ...updated } : comment
        )));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update comment");
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-lg font-semibold">Comments</div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-full sm:w-56" placeholder="Search content" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Input className="w-full sm:w-36" placeholder="Course code" value={code} onChange={(e) => { setCode(e.target.value); setPage(1); }} />
        <Select value={hidden} onValueChange={(value) => { setHidden(value); setPage(1); }}>
          <SelectTrigger className="w-full sm:w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="0">Visible</SelectItem>
            <SelectItem value="1">Hidden</SelectItem>
          </SelectContent>
        </Select>
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => void loadPage(1, false)} disabled={loading}>Refresh</Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-gray-50">
            <tr className="border-b text-gray-500">
              <th className="p-3">ID</th>
              <th className="p-3">Course / Prof</th>
              <th className="p-3">Type</th>
              <th className="p-3">Content</th>
              <th className="p-3">Votes</th>
              <th className="p-3">Verified</th>
              <th className="p-3">Visibility</th>
              <th className="p-3">Time</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {comments.map((comment) => (
              <tr key={comment.id} className="border-b last:border-0">
                <td className="p-3">{comment.id}</td>
                <td className="p-3">
                  {comment.course_code ?? "-"}
                  <div className="text-xs text-gray-500">{comment.prof_id ?? "-"}</div>
                </td>
                <td className="p-3 text-xs">
                  {comment.replyto ? `Reply #${comment.replyto}` : "Top-level"}
                </td>
                <td className="max-w-[420px] p-3">
                  <CommentContent className="line-clamp-2 text-xs text-gray-700" content={comment.content ?? "-"} />
                  {comment.content_en ? (
                    <CommentContent className="mt-1 line-clamp-2 text-xs text-gray-500" content={comment.content_en} />
                  ) : null}
                  {comment.img ? (
                    <a
                      className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                      href={comment.img}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Image
                    </a>
                  ) : null}
                </td>
                <td className="p-3 text-xs">
                  <div>↑ {comment.upvote ?? 0}</div>
                  <div>↓ {comment.downvote ?? 0}</div>
                </td>
                <td className="p-3 text-xs">
                  {comment.verify === 1 ? "Yes" : "No"}
                  {comment.verify_account ? <div className="text-gray-500">{comment.verify_account}</div> : null}
                </td>
                <td className="p-3">{comment.hidden === 1 ? "Hidden" : "Visible"}</td>
                <td className="p-3 text-xs">{String(comment.pub_time).slice(0, 19).replace("T", " ")}</td>
                <td className="p-3">
                  <Button size="xs" variant="outline" onClick={() => openEdit(comment)}>Edit</Button>
                </td>
              </tr>
            ))}
            {!loading && comments.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-6 text-center text-gray-500">No comments</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <AdminInfiniteScroll
        canLoadMore={hasMore}
        loading={loading || loadingMore}
        onLoadMore={loadMore}
      />

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Edit comment #{editing?.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea value={draftContent} onChange={(e) => setDraftContent(e.target.value)} className="min-h-32" />
            <Textarea
              value={draftContentEn}
              onChange={(e) => setDraftContentEn(e.target.value)}
              placeholder="English content (optional)"
            />
            <Input value={draftImg} onChange={(e) => setDraftImg(e.target.value)} placeholder="Image URL (optional)" />
            <div className="flex items-center gap-3 text-sm">
              <Switch checked={draftHidden} onCheckedChange={setDraftHidden} />
              <span>Hidden from public comments</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
