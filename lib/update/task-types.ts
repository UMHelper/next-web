import type { SupabaseClient } from "@supabase/supabase-js";

import type { ScheduleMode, ScheduleRow } from "@/lib/update/types";
import type { UmCourse } from "@/lib/update/um-api";

export type TaskContext = {
  client: SupabaseClient;
  rows: ScheduleRow[];
  mode: ScheduleMode;
  targetYear: number;
  targetSem: number;
  onProgress(done: number, total: number, log?: string): void;
  signal: AbortSignal;
  fetchUm?: (code: string) => Promise<UmCourse | null>;
};

export type UpdateTask = {
  id: string;
  label: string;
  modes: ScheduleMode[];
  run(ctx: TaskContext): Promise<string>;
};
