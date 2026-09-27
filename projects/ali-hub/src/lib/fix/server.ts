/** Fix chat tables · self-create on first use (the migrate route also spreads FIX_DDL). */

import { db } from "@/db";
import { sql } from "drizzle-orm";

export const FIX_DDL = [
  `CREATE TABLE IF NOT EXISTS fix_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id TEXT NOT NULL UNIQUE,
    text TEXT NOT NULL,
    images TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    reply TEXT,
    commit_sha TEXT,
    batch_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    started_at INTEGER,
    finished_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS fix_worker (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    seen_at INTEGER NOT NULL,
    note TEXT
  )`,
];

let ready: Promise<void> | null = null;

export function ensureFixTables() {
  ready ??= (async () => {
    for (const ddl of FIX_DDL) { try { await db.run(sql.raw(ddl)); } catch { /* exists */ } }
  })();
  return ready;
}
