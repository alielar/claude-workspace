/**
 * GET  /api/workouts/run-logs → list all run logs
 * POST /api/workouts/run-logs → log a run
 *   body: { date, distanceKm, durationSeconds, notes? }
 *
 * Pace (seconds per km) is auto-calculated from distanceKm and durationSeconds.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { runLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(runLogs)
    .where(eq(runLogs.userId, session.user.id))
    .orderBy(desc(runLogs.date));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { date, distanceKm, durationSeconds, notes } = await req.json();

  if (!date || !distanceKm || !durationSeconds) {
    return NextResponse.json({ error: "date, distanceKm, durationSeconds required" }, { status: 400 });
  }

  const paceSecondsPerKm = Math.round(durationSeconds / distanceKm);

  const [run] = await db
    .insert(runLogs)
    .values({
      userId: session.user.id,
      date,
      distanceKm,
      durationSeconds,
      paceSecondsPerKm,
      notes: notes ?? null,
    })
    .returning();

  return NextResponse.json(run);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = Number(req.nextUrl.searchParams.get("id"));
  await db
    .delete(runLogs)
    .where(eq(runLogs.id, id));

  return NextResponse.json({ success: true });
}
