import { db } from "@/db";
import { kbWorkouts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_WORKOUTS, KB1_RETIRED_IDS, type TrainExercise, type TrainWorkout, type WorkoutKey } from "@/lib/train/types";

/**
 * 2026-09-20 recipe change. A stored kb1 row still holding a retired move (snatch,
 * crush thruster, plain squat) is on the old 13-move / 60-minute recipe: replace its
 * exercises, length and round rest with the new defaults, KEEPING the how-to links
 * Ali attached to each move (matched by id · a renamed or new move starts without one).
 * Runs once; a row already on the new recipe is left exactly as he has edited it.
 */
async function migrateKb1(row: typeof kbWorkouts.$inferSelect): Promise<typeof kbWorkouts.$inferSelect> {
  if (row.key !== "kb1") return row;
  let old: TrainExercise[] = [];
  try { old = JSON.parse(row.exercises); } catch { return row; }
  if (!old.some((e) => KB1_RETIRED_IDS.includes(e.id))) return row;
  const fresh = DEFAULT_WORKOUTS.find((w) => w.key === "kb1")!;
  const links = new Map(old.filter((e) => e.videoUrl).map((e) => [e.id, e.videoUrl!]));
  const exercises = fresh.exercises.map((e) => ({ ...e, videoUrl: links.get(e.id) ?? null }));
  const patch = { exercises: JSON.stringify(exercises), amrapMinutes: fresh.amrapMinutes, restSeconds: fresh.restSeconds, updatedAt: new Date() };
  await db.update(kbWorkouts).set(patch).where(eq(kbWorkouts.id, row.id));
  return { ...row, ...patch };
}

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
        exercises: JSON.stringify(w.exercises), assignedDays: w.assignedDays ? JSON.stringify(w.assignedDays) : null,
      });
    } catch { /* raced · fine */ }
  }
  const fresh = seededAll ? rows : await db.select().from(kbWorkouts).where(eq(kbWorkouts.userId, userId));
  const live = new Set(DEFAULT_WORKOUTS.map((w) => w.key as string));
  const migrated = await Promise.all(fresh.filter((r) => live.has(r.key)).map((r) => migrateKb1(r).catch(() => r)));
  return migrated.map(rowToWorkout).sort((a, b) => (a.key < b.key ? -1 : 1));
}
