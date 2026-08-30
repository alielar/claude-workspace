"use client";

/**
 * Local-first hooks for the Train tab.
 *  - templates: cached, edited inline, saved through the outbox (idempotent PATCH)
 *  - overview: cached read of history / weekly bests / next workout
 *  - active session: lives in localStorage while you train, so a crash or a
 *    locked phone loses nothing; saved through the outbox when finished
 */

import { useCallback } from "react";
import { useCached, fetchJson, readCache, writeCache } from "@/lib/local/store";
import { sendOrQueue } from "@/lib/local/outbox";
import { DEFAULT_WORKOUTS, type TrainOverview, type TrainSession, type TrainWorkout, type WorkoutKey } from "@/lib/train/types";

const ACTIVE_KEY = "train-active";

export function useWorkouts() {
  const { data, loading, setData, refresh } = useCached<{ workouts: TrainWorkout[] }>(
    "train-workouts",
    () => fetchJson<{ workouts: TrainWorkout[] }>("/api/train/workouts")
  );
  const workouts = data?.workouts ?? (loading ? [] : DEFAULT_WORKOUTS);

  const saveWorkout = useCallback(async (w: TrainWorkout) => {
    setData((prev) => ({ workouts: (prev?.workouts ?? DEFAULT_WORKOUTS).map((x) => (x.key === w.key ? w : x)) }));
    try {
      await sendOrQueue({
        url: "/api/train/workouts",
        method: "PATCH",
        body: { key: w.key, exercises: w.exercises, restSeconds: w.restSeconds, amrapMinutes: w.amrapMinutes, assignedDays: w.assignedDays ?? [] },
        dedupeKey: `train-workout:${w.key}`,
      });
    } catch { /* server refused — next refresh shows the truth */ }
  }, [setData]);

  return { workouts, loading, saveWorkout, refresh };
}

export function useOverview() {
  return useCached<TrainOverview>("train-overview", () => fetchJson<TrainOverview>("/api/train/sessions"));
}

// Memoised on the raw stored string so it is safe as a useSyncExternalStore snapshot
// (a fresh object on every call would make React loop).
let activeRaw: string | null | undefined;
let activeParsed: TrainSession | null = null;
export function readActiveSession(): TrainSession | null {
  let raw: string | null = null;
  try { raw = localStorage.getItem("cc:v1:" + ACTIVE_KEY); } catch { raw = null; }
  if (raw !== activeRaw) {
    activeRaw = raw;
    activeParsed = readCache<TrainSession>(ACTIVE_KEY)?.data ?? null;
  }
  return activeParsed;
}

export function writeActiveSession(s: TrainSession | null) {
  if (s === null) {
    try { localStorage.removeItem("cc:v1:" + ACTIVE_KEY); } catch { /* ignore */ }
  } else {
    writeCache(ACTIVE_KEY, s);
  }
}

/** Save a finished session: update the cached overview optimistically, then send. */
export async function saveSession(s: TrainSession) {
  const cached = readCache<TrainOverview>("train-overview");
  if (cached) {
    const others = cached.data.sessions.filter((x) => x.clientId !== s.clientId);
    writeCache("train-overview", { ...cached.data, sessions: [s, ...others] });
  }
  writeActiveSession(null);
  try {
    await sendOrQueue({
      url: "/api/train/sessions",
      method: "POST",
      body: s,
      dedupeKey: `train-session:${s.clientId}`,
    });
  } catch { /* server refused — kept locally in the overview until next refresh */ }
}

export function workoutByKey(workouts: TrainWorkout[], key: WorkoutKey): TrainWorkout {
  return workouts.find((w) => w.key === key) ?? DEFAULT_WORKOUTS.find((w) => w.key === key)!;
}
