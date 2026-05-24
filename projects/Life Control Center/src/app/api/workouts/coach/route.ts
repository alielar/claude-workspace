/**
 * GET  /api/workouts/coach  — returns the latest coach card for current week
 * POST /api/workouts/coach  — generates a new card (rate-limited to 1/day manual)
 *
 * Weekly cron (vercel.json): Mon 07:00 UTC → POST with { source: "cron" }
 * Manual refresh: POST without body — blocked if already generated today
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { workoutCoach, gymSessions, gymSets, exercisePrs } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

function weekStart(): string {
  const now = new Date(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(new Date())
  );
  const dow = now.getDay(); // 0=Sun
  const daysFromMon = (dow + 6) % 7;
  const mon = new Date(now);
  mon.setDate(mon.getDate() - daysFromMon);
  return mon.toISOString().slice(0, 10);
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const [card] = await db
    .select()
    .from(workoutCoach)
    .where(eq(workoutCoach.userId, userId))
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
    const todayStart = new Date(todayMadrid + "T00:00:00.000Z").getTime();
    const [recent] = await db
      .select({ generatedAt: workoutCoach.generatedAt })
      .from(workoutCoach)
      .where(
        and(
          eq(workoutCoach.userId, userId),
          sql`${workoutCoach.generatedAt} >= ${todayStart}`
        )
      )
      .limit(1);
    if (recent) {
      return NextResponse.json({ error: "Already generated today" }, { status: 429 });
    }
  }

  // ── Pull training data (last 4 weeks) ─────────────────────────────────────
  const fourWeeksAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return d.toISOString().slice(0, 10);
  })();

  const recentSessions = await db
    .select({ id: gymSessions.id, date: gymSessions.date, workoutName: gymSessions.workoutName })
    .from(gymSessions)
    .where(
      and(
        eq(gymSessions.userId, userId),
        sql`${gymSessions.date} >= ${fourWeeksAgo}`
      )
    )
    .orderBy(desc(gymSessions.date))
    .limit(20);

  // Volume by muscle (last 2 weeks)
  const twoWeeksAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  })();

  interface MuscleVol { muscle: string | null; sets: number }
  let muscleVolume: MuscleVol[] = [];
  if (recentSessions.length > 0) {
    const recentIds = recentSessions
      .filter(s => s.date >= twoWeeksAgo)
      .map(s => s.id);
    if (recentIds.length > 0) {
      muscleVolume = await db
        .select({
          muscle: gymSets.exerciseName,
          sets: sql<number>`count(*)`,
        })
        .from(gymSets)
        .where(sql`${gymSets.sessionId} IN (${sql.join(recentIds.map(id => sql`${id}`), sql`,`)})`)
        .groupBy(gymSets.exerciseName)
        .orderBy(sql`count(*) DESC`)
        .limit(10) as MuscleVol[];
    }
  }

  // Top PRs
  const prs = await db
    .select({
      exerciseName: exercisePrs.exerciseName,
      bestWeightKg: exercisePrs.bestWeightKg,
      estimated1rm: exercisePrs.estimated1rm,
      achievedAt: exercisePrs.achievedAt,
    })
    .from(exercisePrs)
    .where(eq(exercisePrs.userId, userId))
    .orderBy(desc(exercisePrs.achievedAt))
    .limit(5);

  // ── Build AI prompt ────────────────────────────────────────────────────────
  const sessionSummary = recentSessions.length > 0
    ? `${recentSessions.length} sessions in last 4 weeks. Types: ${[...new Set(recentSessions.map(s => s.workoutName))].join(", ")}.`
    : "No recent sessions logged.";

  const volumeSummary = muscleVolume.length > 0
    ? muscleVolume.map(m => `${m.muscle}: ${m.sets} sets`).join(", ")
    : "No volume data.";

  const prSummary = prs.length > 0
    ? prs.map(p => `${p.exerciseName} ${p.bestWeightKg ?? "BW"}kg (est 1RM ${Math.round(p.estimated1rm ?? 0)}kg) on ${p.achievedAt}`).join("; ")
    : "No PRs yet.";

  const prompt = `You are a concise, encouraging personal trainer writing a weekly AI coaching note.

Training data for the past 4 weeks:
- Sessions: ${sessionSummary}
- Volume (top exercises, last 2 weeks): ${volumeSummary}
- Recent PRs: ${prSummary}

Write a SHORT weekly coaching note (3-5 sentences max). Include:
1. One specific observation about the training data
2. One actionable tip for next week
3. One motivating closing line

Tone: direct, supportive, data-driven. No generic advice. No headers or bullet points — flowing text only.`;

  const client = new Anthropic();
  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 400,
    messages: [{ role: "user", content: prompt }],
  });

  const content = (message.content[0] as { type: string; text: string }).text?.trim() ?? "";
  if (!content) {
    return NextResponse.json({ error: "AI returned empty response" }, { status: 500 });
  }

  const ws = weekStart();

  // Delete any existing card for this week (replace with fresh)
  await db.delete(workoutCoach).where(
    and(eq(workoutCoach.userId, userId), eq(workoutCoach.weekStart, ws))
  ).catch(() => {});

  const [card] = await db
    .insert(workoutCoach)
    .values({ userId, weekStart: ws, content })
    .returning();

  return NextResponse.json(card);
}
