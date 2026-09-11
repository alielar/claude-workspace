/**
 * GET  /api/workouts/coach  · returns the latest coach card
 * POST /api/workouts/coach  · generates a new card (rate-limited to 1/day manual)
 */

export const maxDuration = 60;

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutCoach } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateCoachCard } from "@/lib/workouts/generateCoach";

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [card] = await db
    .select()
    .from(workoutCoach)
    .where(eq(workoutCoach.userId, session.user.id))
    .orderBy(desc(workoutCoach.generatedAt))
    .limit(1);

  return NextResponse.json(card ?? null);
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  let isCron = false;
  try {
    const body = await req.json();
    isCron = body?.source === "cron";
  } catch { /* no body */ }

  // Rate-limit manual requests: 1 per day
  if (!isCron) {
    const todayMadrid = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date());
    // Use Madrid midnight (not UTC midnight) for the rate-limit window
    const madridMidnight = new Date(todayMadrid + "T00:00:00+02:00").getTime();
    const [recent] = await db
      .select({ generatedAt: workoutCoach.generatedAt })
      .from(workoutCoach)
      .where(
        and(
          eq(workoutCoach.userId, userId),
          sql`${workoutCoach.generatedAt} >= ${madridMidnight}`
        )
      )
      .limit(1);
    if (recent) {
      return NextResponse.json({ error: "Already generated today" }, { status: 429 });
    }
  }

  try {
    const card = await generateCoachCard(userId);
    return NextResponse.json(card);
  } catch (err) {
    console.error("[coach] Generation failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 }
    );
  }
}
