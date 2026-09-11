/**
 * Columns added after the table shipped, installed on first use, once per server instance.
 * Same statements as POST /api/admin/migrate (idempotent · "duplicate column" is swallowed).
 * Exists because a `db.select()` over user_settings fails the moment the schema names a
 * column Turso does not have yet, and the 06:00 brief runs before anyone opens the app.
 */

import { db } from "@/db";
import { sql } from "drizzle-orm";

const LATE_COLUMNS = [
  `ALTER TABLE user_settings ADD COLUMN news_custom_channels TEXT`,
];

let done: Promise<void> | null = null;

export function ensureSettingsColumns(): Promise<void> {
  done ??= (async () => {
    for (const ddl of LATE_COLUMNS) {
      try { await db.run(sql.raw(ddl)); } catch { /* already there */ }
    }
  })();
  return done;
}
