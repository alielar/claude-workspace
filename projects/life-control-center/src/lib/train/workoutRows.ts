import { db } from "@/db";
import { kbWorkouts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_WORKOUTS, type TrainExercise, type TrainWorkout, type WorkoutKey } from "@/lib/train/types";

/** DB row → API shape (server-side only). */
export function rowToWorkout(r: typeof kbWorkouts.$inferSelect): TrainWorkout {
  let exercises: TrainExercise[] = [];
  let assignedDays: string[] | null = null;
  try { exercises = JSON.parse(r.exercises); } catch { /* keep [] */ }
  try { assignedDays = r.assignedDays ? JSON.parse(r.assignedDays) : null; } catch { /* keep null */ }
  return {
    key: r.key as WorkoutKey,
    name: r.name,
    format: r.format as TrainWorkout["format"],
    amrapMinutes: r.amrapMinutes,
    restSeconds: r.restSeconds,
    exercises,
    assignedDays,
  };
}

/** The live templates, seeding the defaults on first call. Rows for retired keys
 * (w1/w2/w3, replaced by the KB Hour 2026-09-10) stay in the DB for session
 * history but are not returned or playable. */
export async function loadOrSeedWorkouts(userId: string): Promise<TrainWorkout[]> {
  const rows = await db.select().from(kbWorkouts).where(eq(kbWorkouts.userId, userId));
  const have = new Set(rows.map((r) => r.key));
  const seededAll = DEFAULT_WORKOUTS.every((w) => have.has(w.key));
  for (const w of DEFAULT_WORKOUTS) {
    if (have.has(w.key)) continue;
    try {
      await db.insert(kbWorkouts).values({
        userId, key: w.key, name: w.name, format: w.format,
        amrapMinutes: w.amrapMinutes, restSeconds: w.restSeconds,
        exercises: JSON.stringify(w.exercises), assignedDays: null,
      });
    } catch { /* raced · fine */ }
  }
  const fresh = seededAll ? rows : await db.select().from(kbWorkouts).where(eq(kbWorkouts.userId, userId));
  const live = new Set(DEFAULT_WORKOUTS.map((w) => w.key as string));
  return fresh.filter((r) => live.has(r.key)).map(rowToWorkout).sort((a, b) => (a.key < b.key ? -1 : 1));
}
