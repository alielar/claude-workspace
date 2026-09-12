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
const TODO_COLUMNS = [
  `ALTER TABLE todos ADD COLUMN format TEXT`,
];

function once(ddls: string[]) {
  let done: Promise<void> | null = null;
  return () => {
    done ??= (async () => {
      for (const ddl of ddls) {
        try { await db.run(sql.raw(ddl)); } catch { /* already there */ }
      }
    })();
    return done;
  };
}

export const ensureSettingsColumns = once(LATE_COLUMNS);
export const ensureTodoColumns = once(TODO_COLUMNS);
