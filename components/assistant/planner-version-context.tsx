"use client";

import { createContext, useContext } from "react";

export const PlannerVersionContext = createContext<string | null>(null);

export function usePlannerVersion(): string | null {
  return useContext(PlannerVersionContext);
}
