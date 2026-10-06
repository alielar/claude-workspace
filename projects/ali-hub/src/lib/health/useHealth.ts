"use client";

import { useCached, fetchJson } from "@/lib/local/store";
import type { HealthSummary, WorkoutDetail } from "./summary";

/** The Watch summary · phone copy first, refreshed in the background like every other module. */
export function useHealthSummary() {
  return useCached<HealthSummary>("health-summary", () => fetchJson<HealthSummary>("/api/health/summary"));
}

export function useWorkoutDetail(hkId: string) {
  const r = useCached<WorkoutDetail>(`health-workout:${hkId}`, () => fetchJson<WorkoutDetail>(`/api/health/workout/${encodeURIComponent(hkId)}`));
  // The phone's saved copy may predate a list (intervals arrived 2026-10-06 · "Cannot read properties of undefined (reading 'length')") · every series defaults to [].
  const data = r.data ? { ...r.data, route: r.data.route ?? [], hr: r.data.hr ?? [], splits: r.data.splits ?? [], intervals: r.data.intervals ?? [] } : r.data;
  return { ...r, data };
}
