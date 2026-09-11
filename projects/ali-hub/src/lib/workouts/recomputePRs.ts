/**
 * Recompute personal records for specific exercises.
 * Called after deleting a session to ensure PRs stay accurate.
 */

import { db } from "@/db";
import { exercisePrs, gymSets, gymSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";

function epley1rm(weightKg: number, reps: number): number {
  if (reps <= 0) return weightKg;
  return weightKg * (1 + reps / 30);
}

export async function recomputePRs(userId: string, exerciseIds: number[]) {
  for (const exId of exerciseIds) {
    // Get all remaining sets for this exercise across all sessions
    const sets = await db
      .select({
        weightKg: gymSets.weightKg,
        reps: gymSets.reps,
        exerciseName: gymSets.exerciseName,
        date: gymSessions.date,
      })
      .from(gymSets)
      .innerJoin(gymSessions, eq(gymSets.sessionId, gymSessions.id))
      .where(
        and(
          eq(gymSets.exerciseId, exId),
          eq(gymSessions.userId, userId),
        )
      );

    // Find the best 1RM across all remaining sets
    let best1rm = 0;
    let bestWeight = 0;
    let bestReps = 0;
    let bestDate = "";
    let bestName = "";

    for (const s of sets) {
      if (!s.weightKg || !s.reps || s.reps <= 0) continue;
      const e1rm = epley1rm(s.weightKg, s.reps);
      if (e1rm > best1rm) {
        best1rm = e1rm;
        bestWeight = s.weightKg;
        bestReps = s.reps;
        bestDate = s.date;
        bestName = s.exerciseName;
      }
    }

    // Get existing PR row
    const [existing] = await db
      .select()
      .from(exercisePrs)
      .where(and(eq(exercisePrs.userId, userId), eq(exercisePrs.exerciseId, exId)))
      .limit(1);

    if (best1rm === 0) {
      // No remaining sets - delete the PR
      if (existing) {
        await db.delete(exercisePrs).where(eq(exercisePrs.id, existing.id));
      }
    } else if (existing) {
      // Update with new best
      await db
        .update(exercisePrs)
        .set({
          bestWeightKg: bestWeight,
          bestReps: bestReps,
          estimated1rm: best1rm,
          achievedAt: bestDate,
          exerciseName: bestName,
        })
        .where(eq(exercisePrs.id, existing.id));
    }
    // If no existing and best1rm > 0, the PR was already correct (shouldn't happen in delete flow)
  }
}
