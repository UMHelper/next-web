"use client";

import React, { useState } from "react";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { LocalPlan } from "@/lib/timetable/store";

export default function ShareDialog({ plan }: { plan: LocalPlan }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!plan.serverId) {
      toast.error("Wait for this plan to sync before sharing.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/timetable/plans/${plan.serverId}/share`);
      const body = await response.json();
      setUrl(body.shared ? body.url : null);
    } catch {
      toast.error("Unable to load share state.");
    } finally {
      setLoading(false);
    }
  };

  const createOrRotate = async (rotate: boolean) => {
    if (!plan.serverId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/timetable/plans/${plan.serverId}/share`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rotate }),
      });
      const body = await response.json();
      setUrl(body.url);
      toast.success(rotate ? "New share link created." : "Share link ready.");
    } catch {
      toast.error("Unable to create share link.");
    } finally {
      setLoading(false);
    }
  };

  const revoke = async () => {
    if (!plan.serverId) return;
    setLoading(true);
    try {
      await fetch(`/api/timetable/plans/${plan.serverId}/share`, {
        method: "DELETE",
      });
      setUrl(null);
      toast.success("Share link revoked.");
    } catch {
      toast.error("Unable to revoke share link.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void load();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1">
          <Share2 size={14} /> Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share timetable</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          {loading ? (
            <Skeleton className="h-9 w-full rounded" />
          ) : url ? (
            <>
              <div className="break-all rounded bg-slate-50 p-2 text-xs">{url}</div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copied.");
                  }}
                >
                  <Copy size={14} /> Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void createOrRotate(true)}
                >
                  Regenerate
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void revoke()}>
                  Revoke
                </Button>
              </div>
            </>
          ) : (
            <Button size="sm" onClick={() => void createOrRotate(false)}>
              Create share link
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
