/**
 * GET  /api/train/sessions — overview: recent sessions, weekly AMRAP bests, next workout, number to beat
 * POST /api/train/sessions — save a session (upsert by clientId → safe to replay offline)
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { kbSessions, userSettings } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { checklistToday } from "@/lib/checklist/day";
import { isoWeekKey, nextWorkoutKey, numberToBeat, weeklyBests, sessionsPerWeek, weekStreak, type TrainOverview } from "@/lib/train/types";
import { rowToSession } from "@/lib/train/rows";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const today = checklistToday();

  const [rows, [settings]] = await Promise.all([
    db.select().from(kbSessions).where(eq(kbSessions.userId, userId))
      .orderBy(desc(kbSessions.date), desc(kbSessions.startedAt)).limit(60),
    db.select({ kettlebellKg: userSettings.kettlebellKg }).from(userSettings)
      .where(eq(userSettings.userId, userId)).limit(1),
  ]);

  const sessions = rows.map(rowToSession);
  const bests = weeklyBests(sessions, today);
  const thisWeek = bests.find((b) => b.week === isoWeekKey(today));

  const overview: TrainOverview = {
    sessions,
    weeklyBests: bests,
    next: nextWorkoutKey(sessions),
    toBeat: numberToBeat(bests, today),
    thisWeekBest: thisWeek ? thisWeek.best : null,
    thisWeekSessions: sessionsPerWeek(sessions).get(isoWeekKey(today)) ?? 0,
    weekStreak: weekStreak(sessions, today),
    kettlebellKg: settings?.kettlebellKg ?? 12,
  };
  return NextResponse.json(overview);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;
  const b = await req.json();

  if (typeof b?.clientId !== "string" || !b.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
  if (b.workoutKey !== "w1" && b.workoutKey !== "w2") return NextResponse.json({ error: "bad workoutKey" }, { status: 400 });
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return NextResponse.json({ error: "bad date" }, { status: 400 });

  const values = {
    userId,
    clientId: b.clientId,
    workoutKey: b.workoutKey,
    date: b.date,
    startedAt: new Date(Number(b.startedAt) || Date.now()),
    finishedAt: b.finishedAt ? new Date(Number(b.finishedAt)) : null,
    durationSeconds: b.durationSeconds != null ? Math.round(Number(b.durationSeconds)) : null,
    rounds: b.rounds != null ? Math.round(Number(b.rounds)) : null,
    weightKg: b.weightKg != null ? Number(b.weightKg) : null,
    log: JSON.stringify(b.log ?? {}),
    notes: typeof b.notes === "string" ? b.notes.slice(0, 2000) : null,
  };

  const [existing] = await db.select({ id: kbSessions.id }).from(kbSessions)
    .where(and(eq(kbSessions.userId, userId), eq(kbSessions.clientId, b.clientId))).limit(1);

  if (existing) {
    await db.update(kbSessions).set(values).where(eq(kbSessions.id, existing.id));
  } else {
    try { await db.insert(kbSessions).values(values); }
    catch { await db.update(kbSessions).set(values).where(eq(kbSessions.clientId, b.clientId)); }
  }
  return NextResponse.json({ ok: true });
}
