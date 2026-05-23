/**
 * GET /api/workouts/export
 * Returns all workout data as CSV via a single JOIN query.
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { gymSessions, gymSets } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

function todayMadrid(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
}

function escapeCSV(val: string | null | undefined): string {
  if (val == null) return "";
  const s = String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Single JOIN query — no N+1
  const rows = await db
    .select({
      date: gymSessions.date,
      workoutName: gymSessions.workoutName,
      sessionNotes: gymSessions.notes,
      exerciseName: gymSets.exerciseName,
      setNumber: gymSets.setNumber,
      setType: gymSets.setType,
      weightKg: gymSets.weightKg,
      reps: gymSets.reps,
      durationSeconds: gymSets.durationSeconds,
    })
    .from(gymSessions)
    .leftJoin(gymSets, eq(gymSets.sessionId, gymSessions.id))
    .where(eq(gymSessions.userId, session.user.id))
    .orderBy(desc(gymSessions.date), gymSets.setNumber);

  if (rows.length === 0) {
    return new NextResponse("No data to export", { status: 404 });
  }

  // Build CSV
  const headers = ["Date", "Workout", "Exercise", "Set", "Set Type", "Weight (kg)", "Reps", "Duration (s)", "Notes"];
  const lines: string[] = [headers.join(",")];

  for (const r of rows) {
    lines.push([
      escapeCSV(r.date),
      escapeCSV(r.workoutName),
      escapeCSV(r.exerciseName),
      r.setNumber != null ? String(r.setNumber) : "",
      escapeCSV(r.setType),
      r.weightKg != null ? String(r.weightKg) : "",
      r.reps != null ? String(r.reps) : "",
      r.durationSeconds != null ? String(r.durationSeconds) : "",
      escapeCSV(r.sessionNotes),
    ].join(","));
  }

  const csv = lines.join("\n");
  const today = todayMadrid();

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="workouts-export-${today}.csv"`,
    },
  });
}
