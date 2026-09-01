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

/** Both templates, seeding the defaults on first call. */
export async function loadOrSeedWorkouts(userId: string): Promise<TrainWorkout[]> {
  const rows = await db.select().from(kbWorkouts).where(eq(kbWorkouts.userId, userId));
  const have = new Set(rows.map((r) => r.key));
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
  const fresh = have.size === DEFAULT_WORKOUTS.length ? rows : await db.select().from(kbWorkouts).where(eq(kbWorkouts.userId, userId));
  return fresh.map(rowToWorkout).sort((a, b) => (a.key < b.key ? -1 : 1));
}
