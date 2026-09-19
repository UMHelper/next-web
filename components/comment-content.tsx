"use client";

import React, { Fragment } from "react";
import { ShieldAlert } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const REDACTED_MARKER = "[REDACTED by UMHelper]";

function RedactedPill() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          title="Redacted by UMHelper"
          className="mx-0.5 inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 align-middle text-[10px] font-medium leading-none text-amber-800"
        >
          <ShieldAlert size={11} strokeWidth={2.5} />
          REDACTED
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-center">
        This content was redacted by UMHelper. / 此內容已被 UMHelper 屏蔽。
      </TooltipContent>
    </Tooltip>
  );
}

export function CommentContent({
  content,
  className,
}: {
  content: string | null | undefined;
  className?: string;
}) {
  if (!content) return null;

  if (!content.includes(REDACTED_MARKER)) {
    return <span className={className}>{content}</span>;
  }

  const parts = content.split(REDACTED_MARKER);

  return (
    <TooltipProvider delayDuration={150}>
      <span className={cn("break-words", className)}>
        {parts.map((part, index) => (
          <Fragment key={index}>
            {part}
            {index < parts.length - 1 ? <RedactedPill /> : null}
          </Fragment>
        ))}
      </span>
    </TooltipProvider>
  );
}
