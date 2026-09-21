import React from "react";

import { Separator } from "@/components/ui/separator";
import { cn, get_bg, get_gpa } from "@/lib/utils";

type RatingStats = {
  result: number | null;
  grade: number | null;
  hard: number | null;
  reward: number | null;
  comments: number | null;
};

type RatingStatsCardProps = {
  stats: RatingStats;
  labels?: {
    overall?: string;
    grade?: string;
    hard?: string;
    reward?: string;
    comments?: string;
  };
};

export function RatingStatsCard({ stats, labels }: RatingStatsCardProps) {
  const finalLabels = {
    overall: "Overall",
    grade: "Grade",
    hard: "Difficulty",
    reward: "Useful",
    comments: "Comments",
    ...labels,
  };

  return (
    <>
      <div className="text-sm font-semibold">
        <div className="text-gray-400 text-xs">{finalLabels.overall}</div>
        <div className={cn(get_bg(stats.result), "bg-clip-text text-transparent")}>
          {get_gpa(stats.result)}
        </div>
      </div>
      <Separator className="my-1" />
      <div className="flex flex-row text-xs font-semibold space-x-2">
        <div>
          <div className="text-gray-400">{finalLabels.grade}</div>
          <div className={cn(get_bg(stats.grade), "bg-clip-text text-transparent")}>
            {get_gpa(stats.grade)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">{finalLabels.hard}</div>
          <div className={cn(get_bg(stats.hard), "bg-clip-text text-transparent")}>
            {get_gpa(stats.hard)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">{finalLabels.reward}</div>
          <div className={cn(get_bg(stats.reward), "bg-clip-text text-transparent")}>
            {get_gpa(stats.reward)}
          </div>
        </div>
        <div>
          <div className="text-gray-400">{finalLabels.comments}</div>
          <div className="text-black">{stats.comments}</div>
        </div>
      </div>
    </>
  );
}
