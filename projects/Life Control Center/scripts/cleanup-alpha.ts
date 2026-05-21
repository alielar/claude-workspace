import dotenv from "dotenv";
import path from "path";
import { createClient } from "@libsql/client";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function main() {
  // Find exercises only referenced by ALPHA sessions (not used in any Beta session)
  const alphaOnly = await client.execute(`
    SELECT DISTINCT gs.exercise_id, gs.exercise_name
    FROM gym_sets gs
    JOIN gym_sessions sess ON gs.session_id = sess.id
    WHERE sess.workout_name LIKE 'ALPHA%'
      AND (gs.exercise_id IS NULL OR gs.exercise_id NOT IN (
        SELECT DISTINCT gs2.exercise_id FROM gym_sets gs2
        JOIN gym_sessions s2 ON gs2.session_id = s2.id
        WHERE s2.workout_name NOT LIKE 'ALPHA%'
        AND gs2.exercise_id IS NOT NULL
      ))
  `);
  console.log("ALPHA-only exercises:", alphaOnly.rows.map((r) => r[1]));

  // Delete sets → sessions → plans → program
  await client.execute(
    `DELETE FROM gym_sets WHERE session_id IN (SELECT id FROM gym_sessions WHERE workout_name LIKE 'ALPHA%')`
  );
  await client.execute(`DELETE FROM gym_sessions WHERE workout_name LIKE 'ALPHA%'`);
  await client.execute(
    `DELETE FROM workout_plans WHERE program_id IN (SELECT id FROM programs WHERE name = 'ALPHA')`
  );
  await client.execute(`DELETE FROM programs WHERE name = 'ALPHA'`);

  // Delete ALPHA-only exercises from library
  for (const row of alphaOnly.rows) {
    const id = row[0];
    if (id != null) {
      await client.execute({ sql: "DELETE FROM exercise_db WHERE id = ?", args: [id] });
    }
  }

  // Clear PRs — will be recomputed from Beta sets
  await client.execute(`DELETE FROM exercise_prs`);

  // Recompute PRs from remaining (Beta) sets
  const sets = await client.execute(`
    SELECT gs.exercise_id, gs.exercise_name, gs.weight_kg, gs.reps, s.date
    FROM gym_sets gs
    JOIN gym_sessions s ON gs.session_id = s.id
    WHERE gs.weight_kg IS NOT NULL AND gs.reps IS NOT NULL AND gs.reps > 0
    ORDER BY gs.exercise_id
  `);

  const userId = (
    await client.execute("SELECT DISTINCT user_id FROM gym_sessions LIMIT 1")
  ).rows[0]?.[0] as string;

  const prMap = new Map<
    number,
    { exerciseName: string; bestWeightKg: number; bestReps: number; e1rm: number; date: string }
  >();

  for (const row of sets.rows) {
    const exId = row[0] as number;
    const exName = row[1] as string;
    const w = row[2] as number;
    const r = row[3] as number;
    const date = row[4] as string;
    const e1rm = w * (1 + r / 30);
    const cur = prMap.get(exId);
    if (!cur || e1rm > cur.e1rm) {
      prMap.set(exId, { exerciseName: exName, bestWeightKg: w, bestReps: r, e1rm, date });
    }
  }

  for (const [exId, pr] of prMap) {
    await client.execute({
      sql: `INSERT INTO exercise_prs (user_id, exercise_id, exercise_name, best_weight_kg, best_reps, estimated_1rm, achieved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [userId, exId, pr.exerciseName, pr.bestWeightKg, pr.bestReps, Math.round(pr.e1rm * 100) / 100, pr.date],
    });
  }

  // Verify final state
  const progCount = (await client.execute("SELECT COUNT(*) FROM programs")).rows[0][0];
  const planCount = (await client.execute("SELECT COUNT(*) FROM workout_plans")).rows[0][0];
  const exCount = (await client.execute("SELECT COUNT(*) FROM exercise_db")).rows[0][0];
  const sessCount = (await client.execute("SELECT COUNT(*) FROM gym_sessions")).rows[0][0];
  const setCount = (await client.execute("SELECT COUNT(*) FROM gym_sets")).rows[0][0];
  const prCount = (await client.execute("SELECT COUNT(*) FROM exercise_prs")).rows[0][0];

  console.log("\n📊 Final state (Beta only):");
  console.log(`   Programs: ${progCount}`);
  console.log(`   Plans:    ${planCount}`);
  console.log(`   Exercises: ${exCount}`);
  console.log(`   Sessions:  ${sessCount}`);
  console.log(`   Sets:      ${setCount}`);
  console.log(`   PRs:       ${prCount}`);

  await client.close();
  console.log("\n✅ ALPHA removed. Only Beta remains.");
}

main().catch((e) => { console.error(e); process.exit(1); });
