import type { kbSessions } from "@/db/schema";
import type { TrainSession, WorkoutKey } from "@/lib/train/types";

/** DB row → API shape (server-side only). */
export function rowToSession(r: typeof kbSessions.$inferSelect): TrainSession {
  let log: TrainSession["log"] = {};
  try { log = JSON.parse(r.log); } catch { /* keep {} */ }
  return {
    clientId: r.clientId,
    workoutKey: r.workoutKey as WorkoutKey,
    date: r.date,
    startedAt: r.startedAt.getTime(),
    finishedAt: r.finishedAt ? r.finishedAt.getTime() : null,
    durationSeconds: r.durationSeconds,
    rounds: r.rounds,
    weightKg: r.weightKg,
    log,
    notes: r.notes,
  };
}
