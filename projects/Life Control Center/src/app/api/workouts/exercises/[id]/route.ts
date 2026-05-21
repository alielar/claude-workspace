/**
 * GET    /api/workouts/exercises/[id]  — get one exercise
 * PATCH  /api/workouts/exercises/[id]  — update exercise
 * DELETE /api/workouts/exercises/[id]  — delete exercise
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { exerciseDb } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const exId = parseInt(id);
  if (isNaN(exId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const [exercise] = await db
    .select()
    .from(exerciseDb)
    .where(and(eq(exerciseDb.id, exId), eq(exerciseDb.userId, session.user.id)))
    .limit(1);

  if (!exercise) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    ...exercise,
    secondaryMuscles: exercise.secondaryMuscles ? JSON.parse(exercise.secondaryMuscles) : [],
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const exId = parseInt(id);
  if (isNaN(exId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  const body = await req.json();
  const update: Partial<typeof exerciseDb.$inferInsert> = {};
  if (body.name             !== undefined) update.name             = body.name;
  if (body.primaryMuscle    !== undefined) update.primaryMuscle    = body.primaryMuscle;
  if (body.secondaryMuscles !== undefined) update.secondaryMuscles = JSON.stringify(body.secondaryMuscles);
  if (body.equipment        !== undefined) update.equipment        = body.equipment;
  if (body.notes            !== undefined) update.notes            = body.notes;
  if (body.weightIncrement  !== undefined) update.weightIncrement  = body.weightIncrement;
  if (body.trackingType     !== undefined) update.trackingType     = body.trackingType;
  if (body.videoUrl         !== undefined) update.videoUrl         = body.videoUrl;
  if (body.videoType        !== undefined) update.videoType        = body.videoType;

  await db
    .update(exerciseDb)
    .set(update)
    .where(and(eq(exerciseDb.id, exId), eq(exerciseDb.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const exId = parseInt(id);
  if (isNaN(exId)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });

  await db
    .delete(exerciseDb)
    .where(and(eq(exerciseDb.id, exId), eq(exerciseDb.userId, session.user.id)));

  return NextResponse.json({ ok: true });
}
