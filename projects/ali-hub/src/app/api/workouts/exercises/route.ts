/**
 * GET  /api/workouts/exercises  · list all exercises in the library
 * POST /api/workouts/exercises  · add a new exercise
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { exerciseDb } from "@/db/schema";
import { eq, asc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const exercises = await db
    .select()
    .from(exerciseDb)
    .where(eq(exerciseDb.userId, session.user.id))
    .orderBy(asc(exerciseDb.name));

  return NextResponse.json(
    exercises.map((e) => ({
      ...e,
      secondaryMuscles: e.secondaryMuscles ? JSON.parse(e.secondaryMuscles) : [],
    }))
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, primaryMuscle, secondaryMuscles, equipment, notes, weightIncrement, trackingType, alternativeGroupId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });

  const [exercise] = await db
    .insert(exerciseDb)
    .values({
      userId: session.user.id,
      name: name.trim(),
      primaryMuscle: primaryMuscle || null,
      secondaryMuscles: secondaryMuscles?.length ? JSON.stringify(secondaryMuscles) : null,
      equipment: equipment || null,
      notes: notes || null,
      weightIncrement: weightIncrement ?? 2.5,
      trackingType: trackingType ?? "reps_weight",
      alternativeGroupId: alternativeGroupId || null,
    })
    .returning();

  return NextResponse.json(
    { ...exercise, secondaryMuscles: secondaryMuscles ?? [] },
    { status: 201 }
  );
}
