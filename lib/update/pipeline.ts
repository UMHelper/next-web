export const PIPELINE_STAGES = [
  { id: "reset", label: "① 重置 offered", tasks: ["reset-offered"] },
  { id: "sync-courses", label: "② 同步课程 + 标记 offered", tasks: ["check-courses", "set-offered"] },
  {
    id: "apply-schedule",
    label: "③ 落排课（time_location + prof + offer + schedule）",
    tasks: ["add-time-location", "add-prof-course", "add-offer-schedule"],
  },
] as const;
