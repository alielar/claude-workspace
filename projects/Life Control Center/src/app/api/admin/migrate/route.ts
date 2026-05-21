/**
 * POST /api/admin/migrate
 *
 * One-shot migration endpoint — creates any new tables that don't exist yet.
 * Protected by session auth (only authenticated users can trigger).
 * Uses CREATE TABLE IF NOT EXISTS so it's safe to run multiple times.
 *
 * Trigger from browser: fetch('/api/admin/migrate', { method: 'POST' })
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { sql } from "drizzle-orm";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const migrations = [
    // ── Checklist items ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      emoji TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,

    // ── Checklist completions ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS checklist_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      completed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,

    // Unique: one completion per item per user per day
    `CREATE UNIQUE INDEX IF NOT EXISTS
      ux_checklist_completion ON checklist_completions(item_id, user_id, date)`,

    // ── Checklist: time-of-day tag (additive — safe to re-run) ─────────────
    `ALTER TABLE checklist_items ADD COLUMN time_of_day TEXT NOT NULL DEFAULT 'anytime'`,

    // ── Reading sessions ─────────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS reading_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      start_page INTEGER NOT NULL DEFAULT 1,
      end_page INTEGER NOT NULL DEFAULT 1,
      duration_minutes INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,

    // ── Word Bank new columns (additive — safe to re-run) ───────────────────
    `ALTER TABLE word_bank_entries ADD COLUMN part_of_speech TEXT`,
    `ALTER TABLE word_bank_entries ADD COLUMN language TEXT NOT NULL DEFAULT 'en'`,
    `ALTER TABLE word_bank_entries ADD COLUMN streak INTEGER NOT NULL DEFAULT 0`,

    // ── Checklist: auto-source, color, notes (additive — safe to re-run) ───
    `ALTER TABLE checklist_items ADD COLUMN auto_source TEXT`,
    `ALTER TABLE checklist_items ADD COLUMN color TEXT NOT NULL DEFAULT 'violet'`,
    `ALTER TABLE checklist_items ADD COLUMN notes TEXT`,

    // ── Checklist suggestions (AI habit ideas generated weekly) ─────────────
    `CREATE TABLE IF NOT EXISTS checklist_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start TEXT NOT NULL,
      title TEXT NOT NULL,
      rationale TEXT NOT NULL,
      suggested_emoji TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,

    // ── Weekly reviews (AI pattern observations) ────────────────────────────
    `CREATE TABLE IF NOT EXISTS weekly_reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_start TEXT NOT NULL,
      pattern_observation TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,

    // ── Workouts v2: programs ────────────────────────────────────────────────
    `CREATE TABLE IF NOT EXISTS programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      cycles INTEGER,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    )`,

    // ── Workouts v2: workout_plans (day templates) ───────────────────────────
    `CREATE TABLE IF NOT EXISTS workout_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      program_id INTEGER NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'strength',
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,

    // ── Workouts v2: exercise_db (master library) ────────────────────────────
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

    // ── Workouts v2: plan_exercises (exercise slots in templates) ────────────
    `CREATE TABLE IF NOT EXISTS plan_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL REFERENCES workout_plans(id) ON DELETE CASCADE,
      exercise_id INTEGER NOT NULL REFERENCES exercise_db(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      set_config TEXT NOT NULL DEFAULT '[]'
    )`,

    // ── Workouts v2: gym_sessions (logged workouts) ──────────────────────────
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

    // ── Workouts v2: gym_sets (individual sets) ──────────────────────────────
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

    // ── Workouts v2: exercise_prs (personal records) ─────────────────────────
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

    // ── Workouts v2: exercise_db new columns ─────────────────────────────────
    `ALTER TABLE exercise_db ADD COLUMN weight_increment REAL NOT NULL DEFAULT 2.5`,
    `ALTER TABLE exercise_db ADD COLUMN video_url TEXT`,
    `ALTER TABLE exercise_db ADD COLUMN video_type TEXT`,
  ];

  const results: string[] = [];
  for (const ddl of migrations) {
    try {
      await db.run(sql.raw(ddl));
      results.push("ok");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push(`error: ${msg}`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
