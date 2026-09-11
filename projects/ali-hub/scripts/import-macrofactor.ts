/**
 * MacroFactor → Life Control Center import script
 *
 * Reads:  data/workout-log.csv
 * Writes: programs, workout_plans, exercise_db, plan_exercises, gym_sessions, gym_sets, exercise_prs
 *
 * Idempotent: safe to run multiple times.
 * Usage: npm run import:macrofactor
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";
import { createClient } from "@libsql/client";
import dotenv from "dotenv";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL) {
  console.error("❌ TURSO_DATABASE_URL not set in .env.local");
  process.exit(1);
}

const client = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

// ── Migrations ───────────────────────────────────────────────────────────────

async function ensureTables() {
  const ddls = [
    `CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      cycles INTEGER,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,
    `CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'strength',
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS exercise_db (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      primary_muscle TEXT,
      secondary_muscles TEXT,
      equipment TEXT,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,
    `CREATE TABLE IF NOT EXISTS plan_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercise_db(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      set_config TEXT NOT NULL DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS gym_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_id INTEGER REFERENCES workout_plans(id),
      program_id INTEGER REFERENCES programs(id),
      workout_name TEXT NOT NULL,
      date TEXT NOT NULL,
      duration_seconds INTEGER,
      notes TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,
    `CREATE TABLE IF NOT EXISTS gym_sets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES gym_sessions(id) ON DELETE CASCADE,
      exercise_id INTEGER REFERENCES exercise_db(id),
      exercise_name TEXT NOT NULL,
      set_number INTEGER NOT NULL,
      set_type TEXT NOT NULL DEFAULT 'standard',
      weight_kg REAL,
      reps INTEGER,
      rir INTEGER,
      duration_seconds INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,
    `CREATE TABLE IF NOT EXISTS exercise_prs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercise_db(id) ON DELETE CASCADE,
      exercise_name TEXT NOT NULL,
      best_weight_kg REAL,
      best_reps INTEGER,
      estimated_1rm REAL,
      achieved_at TEXT NOT NULL
    )`,
  ];
  for (const ddl of ddls) {
    await client.execute(ddl);
  }
  console.log("✅ Tables ready");
}

// ── Muscle data ──────────────────────────────────────────────────────────────

interface MuscleInfo {
  primary: string;
  secondary: string[];
  equipment: string;
}

const muscleMap: Record<string, MuscleInfo> = {
  "low incline dumbbell press": { primary: "chest", secondary: ["front_delts", "triceps"], equipment: "dumbbell" },
  "seated dumbbell overhead press": { primary: "front_delts", secondary: ["side_delts", "triceps"], equipment: "dumbbell" },
  "cable straight bar triceps pushdown": { primary: "triceps", secondary: [], equipment: "cable" },
  "dumbbell fly": { primary: "chest", secondary: ["front_delts"], equipment: "dumbbell" },
  "seated dumbbell lateral raise": { primary: "side_delts", secondary: [], equipment: "dumbbell" },
  "standing dumbbell lateral raise": { primary: "side_delts", secondary: [], equipment: "dumbbell" },
  "seated overhand grip dumbbell rear delt fly": { primary: "rear_delts", secondary: ["upper_back"], equipment: "dumbbell" },
  "seated dumbbell wrist curl": { primary: "forearms", secondary: [], equipment: "dumbbell" },
  "push-up": { primary: "chest", secondary: ["triceps", "front_delts"], equipment: "bodyweight" },
  "close grip push-up": { primary: "triceps", secondary: ["chest", "front_delts"], equipment: "bodyweight" },
  "wide grip push-up": { primary: "chest", secondary: ["front_delts"], equipment: "bodyweight" },
  "incline push-up": { primary: "chest", secondary: ["front_delts", "triceps"], equipment: "bodyweight" },
  "pause push-up": { primary: "chest", secondary: ["triceps", "front_delts"], equipment: "bodyweight" },
  "overhand grip cable lat pulldown": { primary: "lats", secondary: ["upper_back", "biceps"], equipment: "cable" },
  "single arm elbow-in dumbbell row": { primary: "upper_back", secondary: ["lats", "biceps"], equipment: "dumbbell" },
  "dumbbell pullover": { primary: "lats", secondary: ["chest", "serratus"], equipment: "dumbbell" },
  "standing dumbbell biceps curl": { primary: "biceps", secondary: ["forearms"], equipment: "dumbbell" },
  "incline hammer curl": { primary: "biceps", secondary: ["forearms"], equipment: "dumbbell" },
  "standing dumbbell shrug": { primary: "upper_traps", secondary: [], equipment: "dumbbell" },
  "goblet squat": { primary: "quads", secondary: ["glutes", "upper_back"], equipment: "dumbbell" },
  "dumbbell reverse lunge": { primary: "quads", secondary: ["glutes", "hamstrings"], equipment: "dumbbell" },
  "dumbbell forward lunge": { primary: "quads", secondary: ["glutes", "hamstrings"], equipment: "dumbbell" },
  "standing on ground single leg bodyweight calf raise": { primary: "calves", secondary: [], equipment: "bodyweight" },
  "leg extension": { primary: "quads", secondary: [], equipment: "machine" },
  "plank lateral hip flexion": { primary: "obliques", secondary: ["abs"], equipment: "bodyweight" },
  "weighted russian twist": { primary: "obliques", secondary: ["abs"], equipment: "dumbbell" },
  "weighted crunch (holding weight on chest)": { primary: "abs", secondary: [], equipment: "dumbbell" },
  "side plank": { primary: "obliques", secondary: ["abs"], equipment: "bodyweight" },
};

function getMuscle(name: string): MuscleInfo {
  return muscleMap[name.toLowerCase().trim()] ?? { primary: "unknown", secondary: [], equipment: "other" };
}

// ── CSV parser ───────────────────────────────────────────────────────────────

interface LogRow {
  date: string;
  durationSeconds: number;
  workout: string;
  exercise: string;
  setType: string;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  durationSetSeconds: number | null;
}

async function parseWorkoutLog(filePath: string): Promise<LogRow[]> {
  const rows: LogRow[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  let isHeader = true;
  for await (const line of rl) {
    if (isHeader) { isHeader = false; continue; }
    const cols = line.split(",");
    if (cols.length < 10) continue;
    const [date, durationStr, workout, exercise, , setType, weightStr, repsStr, rirStr, durationSetStr] = cols;
    rows.push({
      date: date.trim(),
      durationSeconds: parseInt(durationStr) || 0,
      workout: workout.trim(),
      exercise: exercise.trim(),
      setType: setType.trim(),
      weightKg: weightStr.trim() ? parseFloat(weightStr) : null,
      reps: repsStr.trim() ? parseInt(repsStr) : null,
      rir: rirStr.trim() ? parseInt(rirStr) : null,
      durationSetSeconds: durationSetStr?.trim() ? parseInt(durationSetStr) : null,
    });
  }
  return rows;
}

// ── DB helpers ───────────────────────────────────────────────────────────────

async function getFirstUserId(): Promise<string> {
  const res = await client.execute("SELECT id FROM users LIMIT 1");
  if (res.rows.length === 0) throw new Error("No users found. Log in first.");
  return res.rows[0][0] as string;
}

async function upsertProgram(userId: string, name: string, cycles: number): Promise<number> {
  await client.execute({
    sql: `INSERT INTO programs (user_id, name, cycles, is_active, created_at)
          VALUES (?, ?, ?, 1, unixepoch() * 1000)
          ON CONFLICT DO NOTHING`,
    args: [userId, name, cycles],
  });
  // ON CONFLICT needs a unique index — use SELECT to get or insert
  const sel = await client.execute({
    sql: "SELECT id FROM programs WHERE user_id = ? AND name = ? LIMIT 1",
    args: [userId, name],
  });
  if (sel.rows.length > 0) return sel.rows[0][0] as number;
  throw new Error(`Failed to upsert program: ${name}`);
}

async function upsertWorkoutPlan(programId: number, name: string, type: string, sortOrder: number): Promise<number> {
  const sel = await client.execute({
    sql: "SELECT id FROM workout_plans WHERE program_id = ? AND name = ? LIMIT 1",
    args: [programId, name],
  });
  if (sel.rows.length > 0) return sel.rows[0][0] as number;
  const ins = await client.execute({
    sql: "INSERT INTO workout_plans (program_id, name, type, sort_order) VALUES (?, ?, ?, ?)",
    args: [programId, name, type, sortOrder],
  });
  return Number(ins.lastInsertRowid);
}

async function upsertExercise(userId: string, name: string): Promise<number> {
  const sel = await client.execute({
    sql: "SELECT id FROM exercise_db WHERE user_id = ? AND name = ? LIMIT 1",
    args: [userId, name],
  });
  if (sel.rows.length > 0) return sel.rows[0][0] as number;
  const info = getMuscle(name);
  const ins = await client.execute({
    sql: `INSERT INTO exercise_db (user_id, name, primary_muscle, secondary_muscles, equipment, created_at)
          VALUES (?, ?, ?, ?, ?, unixepoch() * 1000)`,
    args: [userId, name, info.primary, JSON.stringify(info.secondary), info.equipment],
  });
  return Number(ins.lastInsertRowid);
}

async function upsertGymSession(
  userId: string,
  programId: number | null,
  planId: number | null,
  workoutName: string,
  date: string,
  durationSeconds: number
): Promise<number> {
  const sel = await client.execute({
    sql: "SELECT id FROM gym_sessions WHERE user_id = ? AND date = ? AND workout_name = ? LIMIT 1",
    args: [userId, date, workoutName],
  });
  if (sel.rows.length > 0) return sel.rows[0][0] as number;
  const ins = await client.execute({
    sql: `INSERT INTO gym_sessions (user_id, program_id, plan_id, workout_name, date, duration_seconds, created_at)
          VALUES (?, ?, ?, ?, ?, ?, unixepoch() * 1000)`,
    args: [userId, programId, planId, workoutName, date, durationSeconds],
  });
  return Number(ins.lastInsertRowid);
}

// ── 1RM calculation ──────────────────────────────────────────────────────────

function epley1rm(weightKg: number, reps: number): number {
  return weightKg * (1 + reps / 30);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🏋️  MacroFactor import starting…\n");

  await ensureTables();

  const userId = await getFirstUserId();
  console.log(`👤 User: ${userId}`);

  const logPath = path.resolve(process.cwd(), "data/workout-log.csv");
  const rows = await parseWorkoutLog(logPath);
  console.log(`📄 Parsed ${rows.length} set rows from workout-log.csv`);

  // ── 0. Filter: Beta only ──────────────────────────────────────────────────
  const betaRows = rows.filter((r) => r.workout.startsWith("Beta"));
  console.log(`📋 Beta rows: ${betaRows.length} (${rows.length - betaRows.length} ALPHA rows skipped)`);

  // ── 1. Collect unique programs and plan names ─────────────────────────────
  const programNames = new Set<string>();
  const planNamesByProgram = new Map<string, Set<string>>();

  for (const row of betaRows) {
    // workout format: "Beta (Push)" or "ALPHA (Monday)"
    const match = row.workout.match(/^(.+?)\s*\((.+)\)$/);
    if (!match) continue;
    const prog = match[1].trim();   // "Beta" | "ALPHA"
    const plan = match[2].trim();   // "Push" | "Monday"
    programNames.add(prog);
    if (!planNamesByProgram.has(prog)) planNamesByProgram.set(prog, new Set());
    planNamesByProgram.get(prog)!.add(plan);
  }

  // ── 2. Create programs ────────────────────────────────────────────────────
  const programIds = new Map<string, number>();
  for (const name of programNames) {
    const cycles = name === "Beta" ? 7 : null;
    const id = await upsertProgram(userId, name, cycles!);
    programIds.set(name, id);
  }
  console.log(`✅ Programs: ${[...programIds.keys()].join(", ")}`);

  // ── 3. Create workout plans ───────────────────────────────────────────────
  const planTypes: Record<string, string> = {
    "Push": "strength", "Pull": "strength", "Legs": "strength",
    "Push-Up SESH": "skill", "Monday": "strength", "Tuesday": "strength",
  };
  const planIds = new Map<string, number>(); // key = "ProgramName|PlanName"

  for (const [progName, planNames] of planNamesByProgram) {
    const progId = programIds.get(progName)!;
    let i = 0;
    for (const planName of planNames) {
      const type = planTypes[planName] ?? "strength";
      const id = await upsertWorkoutPlan(progId, planName, type, i++);
      planIds.set(`${progName}|${planName}`, id);
    }
  }
  console.log(`✅ Workout plans: ${planIds.size}`);

  // ── 4. Collect unique exercise names ─────────────────────────────────────
  const exerciseNames = new Set(betaRows.map((r) => r.exercise));
  const exerciseIds = new Map<string, number>();
  for (const name of exerciseNames) {
    const id = await upsertExercise(userId, name);
    exerciseIds.set(name, id);
  }
  console.log(`✅ Exercises in library: ${exerciseIds.size}`);

  // ── 5. Group rows by session (date + workout name) ────────────────────────
  const sessionMap = new Map<string, LogRow[]>();
  for (const row of betaRows) {
    const key = `${row.date}|${row.workout}`;
    if (!sessionMap.has(key)) sessionMap.set(key, []);
    sessionMap.get(key)!.push(row);
  }

  const sessionIds = new Map<string, number>(); // key = "date|workout"
  for (const [key, sessionRows] of sessionMap) {
    const [date, workoutName] = key.split("|");
    const match = workoutName.match(/^(.+?)\s*\((.+)\)$/);
    const progName = match ? match[1].trim() : null;
    const planName = match ? match[2].trim() : null;
    const progId = progName ? (programIds.get(progName) ?? null) : null;
    const planId = (progName && planName) ? (planIds.get(`${progName}|${planName}`) ?? null) : null;
    const durationS = sessionRows[0]?.durationSeconds ?? 0;
    const sessionId = await upsertGymSession(userId, progId, planId, workoutName, date, durationS);
    sessionIds.set(key, sessionId);
  }
  console.log(`✅ Gym sessions: ${sessionIds.size}`);

  // ── 6. Insert gym sets ────────────────────────────────────────────────────
  // Track per-session per-exercise set number
  const setCounters = new Map<string, number>(); // key = "sessionId|exerciseName"

  let totalSets = 0;
  // Check if sets already exist (idempotent)
  const existingCheck = await client.execute("SELECT COUNT(*) as cnt FROM gym_sets");
  const existingCount = (existingCheck.rows[0][0] as number) ?? 0;

  if (existingCount > 0) {
    console.log(`⚠️  gym_sets already has ${existingCount} rows — skipping set insert (delete manually to re-import)`);
  } else {
    for (const row of betaRows) {
      const sessionKey = `${row.date}|${row.workout}`;
      const sessionId = sessionIds.get(sessionKey)!;
      const exerciseId = exerciseIds.get(row.exercise) ?? null;

      const counterKey = `${sessionId}|${row.exercise}`;
      const setNum = (setCounters.get(counterKey) ?? 0) + 1;
      setCounters.set(counterKey, setNum);

      const setType = row.setType.toLowerCase().replace(/\s+/g, "_");

      await client.execute({
        sql: `INSERT INTO gym_sets (session_id, exercise_id, exercise_name, set_number, set_type, weight_kg, reps, rir, duration_seconds, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch() * 1000)`,
        args: [sessionId, exerciseId, row.exercise, setNum, setType, row.weightKg, row.reps, row.rir, row.durationSetSeconds],
      });
      totalSets++;
    }
    console.log(`✅ Gym sets inserted: ${totalSets}`);
  }

  // ── 7. Compute PRs ────────────────────────────────────────────────────────
  // Clear and recompute from all sets
  await client.execute({ sql: "DELETE FROM exercise_prs WHERE user_id = ?", args: [userId] });

  // Get all weighted sets grouped by exercise
  const allSets = await client.execute({
    sql: `SELECT gs.exercise_id, gs.exercise_name, gs.weight_kg, gs.reps, s.date
          FROM gym_sets gs
          JOIN gym_sessions s ON gs.session_id = s.id
          WHERE s.user_id = ? AND gs.weight_kg IS NOT NULL AND gs.reps IS NOT NULL AND gs.reps > 0
          ORDER BY gs.exercise_id, s.date DESC`,
    args: [userId],
  });

  interface PRRecord {
    exerciseId: number;
    exerciseName: string;
    bestWeightKg: number;
    bestReps: number;
    estimated1rm: number;
    achievedAt: string;
  }

  const prMap = new Map<number, PRRecord>();

  for (const row of allSets.rows) {
    const exerciseId = row[0] as number;
    const exerciseName = row[1] as string;
    const weightKg = row[2] as number;
    const reps = row[3] as number;
    const date = row[4] as string;
    const e1rm = epley1rm(weightKg, reps);

    const existing = prMap.get(exerciseId);
    if (!existing || e1rm > existing.estimated1rm) {
      prMap.set(exerciseId, {
        exerciseId,
        exerciseName,
        bestWeightKg: weightKg,
        bestReps: reps,
        estimated1rm: Math.round(e1rm * 100) / 100,
        achievedAt: date,
      });
    }
  }

  for (const pr of prMap.values()) {
    await client.execute({
      sql: `INSERT INTO exercise_prs (user_id, exercise_id, exercise_name, best_weight_kg, best_reps, estimated_1rm, achieved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [userId, pr.exerciseId, pr.exerciseName, pr.bestWeightKg, pr.bestReps, pr.estimated1rm, pr.achievedAt],
    });
  }
  console.log(`✅ PRs computed: ${prMap.size}`);

  // ── 8. Summary ────────────────────────────────────────────────────────────
  console.log("\n📊 Import Summary:");
  console.log(`   Programs       : ${programIds.size}`);
  console.log(`   Workout plans  : ${planIds.size}`);
  console.log(`   Exercises      : ${exerciseIds.size}`);
  console.log(`   Sessions       : ${sessionIds.size}`);
  console.log(`   Sets (total)   : ${totalSets || existingCount}`);
  console.log(`   PRs            : ${prMap.size}`);

  // ── 9. Beta program structure ─────────────────────────────────────────────
  const betaId = programIds.get("Beta");
  if (betaId) {
    console.log("\n🏆 Beta Program Structure:");
    const plans = await client.execute({
      sql: "SELECT name, type FROM workout_plans WHERE program_id = ? ORDER BY sort_order",
      args: [betaId],
    });
    for (const p of plans.rows) {
      const planName = p[0] as string;
      const planKey = `Beta|${planName}`;
      const pid = planIds.get(planKey);
      // Collect exercises that appeared in sessions for this plan
      const exercises = new Set<string>();
      for (const [key, sRows] of sessionMap) {
        if (key.includes(`Beta (${planName})`)) {
          for (const r of sRows) exercises.add(r.exercise);
        }
      }
      console.log(`   ${planName} (${p[1]}): ${[...exercises].join(", ")}`);
    }
  }

  // ── 10. Sample of 10 sets from May 4–21 ──────────────────────────────────
  console.log("\n🔍 Sample: 10 logged sets from May 4–21 2026:");
  const sample = await client.execute({
    sql: `SELECT s.date, s.workout_name, gs.exercise_name, gs.set_type, gs.weight_kg, gs.reps, gs.rir
          FROM gym_sets gs
          JOIN gym_sessions s ON gs.session_id = s.id
          WHERE s.user_id = ? AND s.date >= '2026-05-04' AND s.date <= '2026-05-21'
          ORDER BY s.date, gs.id
          LIMIT 10`,
    args: [userId],
  });
  for (const r of sample.rows) {
    const weight = r[4] != null ? `${r[4]}kg` : "BW";
    const reps = r[5] != null ? `×${r[5]}` : "";
    const rir = r[6] != null ? ` RIR${r[6]}` : "";
    console.log(`   ${r[0]} | ${r[1]} | ${r[2]} | ${r[3]} | ${weight}${reps}${rir}`);
  }

  await client.close();
  console.log("\n✅ Import complete!");
}

main().catch((e) => {
  console.error("❌ Import failed:", e);
  process.exit(1);
});
