/**
 * Seed plan_exercises from gym_sets history.
 * For each workout_plan in Beta, finds all unique exercises used in
 * gym_sessions assigned to that plan, then inserts plan_exercises rows.
 *
 * Idempotent: skips plans that already have plan_exercises rows.
 *
 * Usage: npm run seed:plan-exercises
 */

import dotenv from "dotenv";
import path from "path";
import { createClient } from "@libsql/client";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Default set config: 3 working sets, 8-12 reps, 60s rest
function defaultSetConfig(planType: string, exerciseName: string): string {
  const isLegs = planType === "strength" && ["Goblet Squat", "Dumbbell Reverse Lunge", "Dumbbell Forward Lunge"].some(
    (n) => exerciseName.includes(n.split(" ")[0])
  );
  const restS = isLegs ? 120 : 60;
  return JSON.stringify([
    { type: "standard", repMin: 8, repMax: 12, rir: 2, restS },
    { type: "standard", repMin: 8, repMax: 12, rir: 1, restS },
    { type: "standard", repMin: 8, repMax: 12, rir: 0, restS },
  ]);
}

async function main() {
  // Get all workout plans
  const plans = await client.execute(
    `SELECT wp.id, wp.name, wp.type FROM workout_plans wp
     JOIN programs p ON wp.program_id = p.id
     WHERE p.name = 'Beta'
     ORDER BY wp.sort_order`
  );

  let totalInserted = 0;

  for (const planRow of plans.rows) {
    const planId = planRow[0] as number;
    const planName = planRow[1] as string;
    const planType = planRow[2] as string;

    // Check if already seeded
    const existing = await client.execute({
      sql: "SELECT COUNT(*) FROM plan_exercises WHERE plan_id = ?",
      args: [planId],
    });
    if ((existing.rows[0][0] as number) > 0) {
      console.log(`⏭  ${planName}: already has plan_exercises, skipping`);
      continue;
    }

    // Get unique exercises used in sessions for this plan, ordered by first appearance
    const exercises = await client.execute({
      sql: `SELECT DISTINCT gs.exercise_id, gs.exercise_name,
              MIN(gs.rowid) as first_rowid
            FROM gym_sets gs
            JOIN gym_sessions s ON gs.session_id = s.id
            WHERE s.plan_id = ?
            GROUP BY gs.exercise_id, gs.exercise_name
            ORDER BY first_rowid`,
      args: [planId],
    });

    let sortOrder = 0;
    for (const exRow of exercises.rows) {
      const exerciseId = exRow[0] as number;
      const exerciseName = exRow[1] as string;
      const setConfig = defaultSetConfig(planType, exerciseName);

      await client.execute({
        sql: `INSERT INTO plan_exercises (plan_id, exercise_id, sort_order, set_config)
              VALUES (?, ?, ?, ?)`,
        args: [planId, exerciseId, sortOrder++, setConfig],
      });
      totalInserted++;
    }

    console.log(`✅ ${planName}: seeded ${sortOrder} exercises`);
  }

  // Verify
  const counts = await client.execute(`
    SELECT wp.name, COUNT(pe.id) as cnt
    FROM workout_plans wp
    LEFT JOIN plan_exercises pe ON pe.plan_id = wp.id
    GROUP BY wp.id, wp.name
    ORDER BY wp.sort_order
  `);

  console.log("\n📊 plan_exercises summary:");
  for (const r of counts.rows) {
    console.log(`   ${r[0]}: ${r[1]} exercises`);
  }
  console.log(`\n✅ Total inserted: ${totalInserted}`);

  await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
