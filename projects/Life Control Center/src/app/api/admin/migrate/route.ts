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
