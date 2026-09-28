"use client";

import { useCached, fetchJson } from "@/lib/local/store";
import type { HealthSummary, WorkoutDetail } from "./summary";

/** The Watch summary · phone copy first, refreshed in the background like every other module. */
export function useHealthSummary() {
  return useCached<HealthSummary>("health-summary", () => fetchJson<HealthSummary>("/api/health/summary"));
}

export function useWorkoutDetail(hkId: string) {
  return useCached<WorkoutDetail>(`health-workout:${hkId}`, () => fetchJson<WorkoutDetail>(`/api/health/workout/${encodeURIComponent(hkId)}`));
}
