/** Birthdays table DDL · self-creates (the migrate route also spreads BIRTHDAY_DDL). */

import { db } from "@/db";
import { sql } from "drizzle-orm";

export const BIRTHDAY_DDL = [
  `CREATE TABLE IF NOT EXISTS birthdays (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    month INTEGER NOT NULL,
    day INTEGER NOT NULL,
    year INTEGER,
    remind_days_before INTEGER NOT NULL DEFAULT 3,
    notes TEXT,
    notified_year INTEGER,
    deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
];

let ready: Promise<void> | null = null;

export function ensureBirthdayTables() {
  ready ??= (async () => {
    for (const ddl of BIRTHDAY_DDL) { try { await db.run(sql.raw(ddl)); } catch { /* exists */ } }
  })();
  return ready;
}
