/**
 * Idempotent schema install + first seed. Runs once per server instance (lazily, before the
 * first query) and on demand via POST /api/admin/migrate after a deploy.
 */
import { sql } from "drizzle-orm";
import { db } from "./index";
import { people } from "./schema";

const DDL = [
  `CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'family',
    lang TEXT NOT NULL DEFAULT 'en',
    is_admin INTEGER NOT NULL DEFAULT 0,
    is_away INTEGER NOT NULL DEFAULT 0,
    is_child INTEGER NOT NULL DEFAULT 0,
    simple_ui INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT ''
  )`,
];

/** The household on day one. Everything is renameable from the People screen. */
const SEED = [
  { name: "Ali", role: "family", lang: "en", isAdmin: true, sortOrder: 1 },
  { name: "Papa", role: "family", lang: "fr", isAdmin: true, sortOrder: 2 },
  { name: "Mama", role: "family", lang: "fr", isAdmin: true, sortOrder: 3 },
  { name: "Anas", role: "family", lang: "en", isChild: true, sortOrder: 4 },
  { name: "Layla", role: "family", lang: "en", isChild: true, simpleUi: true, sortOrder: 5 },
  { name: "Amsterdam", role: "family", lang: "en", isAway: true, sortOrder: 6 },
  { name: "الطباخة", role: "cook", lang: "ar", sortOrder: 9 },
] as const;

let done: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  done ??= (async () => {
    for (const ddl of DDL) await db.run(sql.raw(ddl));
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(people);
    if (Number(row?.n ?? 0) === 0) {
      const now = new Date().toISOString();
      await db.insert(people).values(SEED.map((p) => ({ ...p, createdAt: now })));
    }
  })().catch((e) => {
    done = null; // let the next request retry
    throw e;
  });
  return done;
}
