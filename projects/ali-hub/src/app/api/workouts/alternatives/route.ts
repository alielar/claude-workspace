/**
 * GET /api/workouts/alternatives?groupId=incline_chest_press
 *   Returns all exercises in the same alternative group.
 *
 * GET /api/workouts/alternatives?exerciseId=42
 *   Looks up the exercise's group, then returns all exercises in that group.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { exerciseDb } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  let groupId = searchParams.get("groupId");
  const exerciseId = searchParams.get("exerciseId");

  // If exerciseId provided, look up its group
  if (!groupId && exerciseId) {
    const exId = parseInt(exerciseId);
    if (isNaN(exId)) return NextResponse.json({ error: "Invalid exerciseId" }, { status: 400 });

    const [ex] = await db
      .select({ alternativeGroupId: exerciseDb.alternativeGroupId })
      .from(exerciseDb)
      .where(and(eq(exerciseDb.id, exId), eq(exerciseDb.userId, session.user.id)))
      .limit(1);

    if (!ex?.alternativeGroupId) {
      return NextResponse.json([]);
    }
    groupId = ex.alternativeGroupId;
  }

  if (!groupId) return NextResponse.json({ error: "groupId or exerciseId required" }, { status: 400 });

  const exercises = await db
    .select({
      id: exerciseDb.id,
      name: exerciseDb.name,
      primaryMuscle: exerciseDb.primaryMuscle,
      equipment: exerciseDb.equipment,
      trackingType: exerciseDb.trackingType,
      weightIncrement: exerciseDb.weightIncrement,
      videoUrl: exerciseDb.videoUrl,
      videoType: exerciseDb.videoType,
      alternativeGroupId: exerciseDb.alternativeGroupId,
      notes: exerciseDb.notes,
    })
    .from(exerciseDb)
    .where(and(eq(exerciseDb.userId, session.user.id), eq(exerciseDb.alternativeGroupId, groupId)));

  return NextResponse.json(exercises);
}
