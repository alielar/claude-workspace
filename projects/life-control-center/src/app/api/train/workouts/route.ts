/**
 * GET   /api/train/workouts — both templates (seeded from defaults on first call)
 * PATCH /api/train/workouts — body { key, exercises?, restSeconds?, amrapMinutes?, assignedDays? }
 *
 * Idempotent: PATCH sends the full desired template, so offline replays are safe.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { kbWorkouts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { DEFAULT_WORKOUTS, type TrainExercise, type TrainWorkout, type WorkoutKey } from "@/lib/train/types";

function rowToWorkout(r: typeof kbWorkouts.$inferSelect): TrainWorkout {
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

async function loadOrSeed(userId: string): Promise<TrainWorkout[]> {
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
    } catch { /* raced — fine */ }
  }
  const fresh = have.size === DEFAULT_WORKOUTS.length ? rows : await db.select().from(kbWorkouts).where(eq(kbWorkouts.userId, userId));
  return fresh.map(rowToWorkout).sort((a, b) => (a.key < b.key ? -1 : 1));
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const workouts = await loadOrSeed(session.user.id);
  return NextResponse.json({ workouts });
}

function cleanExercises(input: unknown): TrainExercise[] | null {
  if (!Array.isArray(input)) return null;
  const out: TrainExercise[] = [];
  for (const e of input) {
    if (!e || typeof e !== "object") return null;
    const x = e as Record<string, unknown>;
    if (typeof x.id !== "string" || typeof x.name !== "string") return null;
    const reps = Number(x.reps), sets = Number(x.sets);
    if (!Number.isFinite(reps) || reps < 1 || reps > 999) return null;
    if (!Number.isFinite(sets) || sets < 1 || sets > 20) return null;
    const weight = x.weightKg === null || x.weightKg === undefined ? null : Number(x.weightKg);
    out.push({
      id: x.id, name: x.name.slice(0, 80),
      reps: Math.round(reps), sets: Math.round(sets),
      perSide: !!x.perSide, kettlebell: !!x.kettlebell,
      weightKg: weight !== null && Number.isFinite(weight) ? weight : null,
    });
  }
  return out;
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const body = await req.json();
  const key = body?.key;
  if (key !== "w1" && key !== "w2") return NextResponse.json({ error: "key must be w1 or w2" }, { status: 400 });

  await loadOrSeed(userId);
  const updates: Partial<typeof kbWorkouts.$inferInsert> = { updatedAt: new Date() };
  if (body.exercises !== undefined) {
    const ex = cleanExercises(body.exercises);
    if (!ex) return NextResponse.json({ error: "bad exercises" }, { status: 400 });
    updates.exercises = JSON.stringify(ex);
  }
  if (body.restSeconds !== undefined) {
    const r = Number(body.restSeconds);
    if (Number.isFinite(r) && r >= 0 && r <= 600) updates.restSeconds = Math.round(r);
  }
  if (body.amrapMinutes !== undefined) {
    const m = Number(body.amrapMinutes);
    if (Number.isFinite(m) && m >= 1 && m <= 120) updates.amrapMinutes = Math.round(m);
  }
  if (body.assignedDays !== undefined) {
    updates.assignedDays = Array.isArray(body.assignedDays) ? JSON.stringify(body.assignedDays) : null;
  }

  const [row] = await db.update(kbWorkouts).set(updates)
    .where(and(eq(kbWorkouts.userId, userId), eq(kbWorkouts.key, key)))
    .returning();
  return NextResponse.json({ workout: row ? rowToWorkout(row) : null });
}
