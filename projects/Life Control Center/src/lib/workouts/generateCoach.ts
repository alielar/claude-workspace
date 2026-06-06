/**
 * Shared coach card generation logic.
 * Used by both the cron route and the manual POST route.
 *
 * Uses Gemini (free) → Anthropic fallback for AI generation.
 * Includes per-exercise progressive overload analysis.
 */

import { db } from "@/db";
import { workoutCoach, gymSessions, gymSets, exercisePrs, planExercises, exerciseDb, workoutPlans, programs } from "@/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { computeProgressionSuggestion, type SetLogSummary } from "@/lib/progressive-overload";

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

/** Try Gemini first (free), fall back to Anthropic Haiku */
async function generateAIText(prompt: string): Promise<string> {
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) return text;
    } catch (err) {
      console.error("[coach] Gemini failed:", err);
    }
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    return (message.content[0] as { type: string; text: string }).text?.trim() ?? "";
  }

  throw new Error("No AI provider available (both GEMINI_API_KEY and ANTHROPIC_API_KEY missing or failed)");
}

export async function generateCoachCard(userId: string) {
  // Pull training data (last 4 weeks)
  const fourWeeksAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return d.toISOString().slice(0, 10);
  })();

  const recentSessions = await db
    .select({
      id: gymSessions.id,
      date: gymSessions.date,
      workoutName: gymSessions.workoutName,
      durationSeconds: gymSessions.durationSeconds,
      planId: gymSessions.planId,
    })
    .from(gymSessions)
    .where(and(eq(gymSessions.userId, userId), sql`${gymSessions.date} >= ${fourWeeksAgo}`))
    .orderBy(desc(gymSessions.date))
    .limit(20);

  // Volume by exercise (last 2 weeks)
  const twoWeeksAgo = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 14);
    return d.toISOString().slice(0, 10);
  })();

  interface MuscleVol { muscle: string | null; sets: number }
  let muscleVolume: MuscleVol[] = [];
  if (recentSessions.length > 0) {
    const recentIds = recentSessions.filter(s => s.date >= twoWeeksAgo).map(s => s.id);
    if (recentIds.length > 0) {
      muscleVolume = await db
        .select({ muscle: gymSets.exerciseName, sets: sql<number>`count(*)` })
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
    .limit(8);

  // ── Per-exercise progressive overload analysis ──
  // Get the last session and its sets + plan config
  const progressionNotes: string[] = [];
  const lastSession = recentSessions[0];
  if (lastSession?.planId) {
    const lastSets = await db
      .select()
      .from(gymSets)
      .where(eq(gymSets.sessionId, lastSession.id))
      .orderBy(gymSets.setNumber);

    const planExs = await db
      .select({
        exerciseId: planExercises.exerciseId,
        exerciseName: exerciseDb.name,
        setConfig: planExercises.setConfig,
      })
      .from(planExercises)
      .innerJoin(exerciseDb, eq(planExercises.exerciseId, exerciseDb.id))
      .where(eq(planExercises.planId, lastSession.planId))
      .orderBy(planExercises.sortOrder);

    for (const ex of planExs) {
      let config: Array<{ repMin: number; repMax: number; type: string }> = [];
      try { config = JSON.parse(ex.setConfig); } catch { config = []; }

      const exSets: SetLogSummary[] = lastSets
        .filter((s) => s.exerciseId === ex.exerciseId)
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => {
          const cfg = config[s.setNumber - 1];
          return {
            setType: (s.setType ?? "standard") as "standard" | "drop" | "warmup",
            weightKg: s.weightKg,
            repsLogged: s.reps,
            repRangeMax: cfg?.repMax ?? null,
          };
        });

      if (exSets.length > 0) {
        const suggestion = computeProgressionSuggestion(ex.exerciseName, exSets);
        const workingSets = exSets.filter(s => s.setType === "standard");
        const weights = workingSets.map(s => s.weightKg).filter(Boolean) as number[];
        const reps = workingSets.map(s => s.repsLogged).filter(Boolean) as number[];
        const avgWeight = weights.length > 0 ? (weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(1) : "BW";
        const avgReps = reps.length > 0 ? Math.round(reps.reduce((a, b) => a + b, 0) / reps.length) : 0;
        progressionNotes.push(
          `${ex.exerciseName}: ${workingSets.length} working sets @ ${avgWeight}kg × ~${avgReps} reps → ${suggestion.action.toUpperCase()}${suggestion.suggestedWeightKg ? ` (next: ${suggestion.suggestedWeightKg}kg)` : ""}`
        );
      }
    }
  }

  // ── Build AI prompt ──
  const sessionSummary = recentSessions.length > 0
    ? `${recentSessions.length} sessions in last 4 weeks. Types: ${[...new Set(recentSessions.map(s => s.workoutName))].join(", ")}. Last session: ${lastSession?.workoutName} on ${lastSession?.date}${lastSession?.durationSeconds ? ` (${Math.round(lastSession.durationSeconds / 60)} min)` : ""}.`
    : "No recent sessions logged.";

  const volumeSummary = muscleVolume.length > 0
    ? muscleVolume.map(m => `${m.muscle}: ${m.sets} sets`).join(", ")
    : "No volume data.";

  const prSummary = prs.length > 0
    ? prs.map(p => `${p.exerciseName} ${p.bestWeightKg ?? "BW"}kg (est 1RM ${Math.round(p.estimated1rm ?? 0)}kg) on ${p.achievedAt}`).join("; ")
    : "No PRs yet.";

  const progressionBlock = progressionNotes.length > 0
    ? `\n\nProgressive overload analysis (last ${lastSession?.workoutName} session):\n${progressionNotes.join("\n")}`
    : "";

  const prompt = `You are an experienced, no-BS personal coach writing a weekly training note. You speak directly and personally — like a coach who knows this athlete well.

Training data (last 4 weeks):
- Sessions: ${sessionSummary}
- Volume (top exercises, 2 weeks): ${volumeSummary}
- Recent PRs: ${prSummary}${progressionBlock}

Write a SHORT coaching note (4-6 sentences). Requirements:
1. Reference SPECIFIC exercises, weights, and numbers from the data — never generic
2. Call out one thing that's going well (be specific about which exercise or pattern)
3. Give one concrete, actionable cue for the next session (e.g., "on your next Push day, try pausing at the bottom of your bench press for 2 seconds" — not vague)
4. If any exercises show "INCREASE", celebrate the progression and mention the new weight
5. End with energy — make it feel like a real coach talking, not a template

Tone: direct, personal, varied. Mix short punchy sentences with longer ones. Avoid starting with "Great" or "Solid" — vary your openers. No headers, no bullet points — flowing text only.`;

  const content = await generateAIText(prompt);
  if (!content) throw new Error("AI returned empty response");

  const ws = weekStart();

  // Replace any existing card for this week
  await db.delete(workoutCoach).where(
    and(eq(workoutCoach.userId, userId), eq(workoutCoach.weekStart, ws))
  ).catch(() => {});

  const [card] = await db
    .insert(workoutCoach)
    .values({ userId, weekStart: ws, content })
    .returning();

  return card;
}
