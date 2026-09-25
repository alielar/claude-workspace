/**
 * Idempotent schema install + first seed. Runs once per server instance (lazily, before the
 * first query) and on demand via POST /api/admin/migrate after a deploy.
 */
import { sql } from "drizzle-orm";
import { db } from "./index";
import { dishes, people } from "./schema";
import { seedDishes } from "./seedDishes";

type Seed = typeof people.$inferInsert;

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
  `CREATE TABLE IF NOT EXISTS dishes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    meal TEXT NOT NULL,
    name_en TEXT NOT NULL,
    name_fr TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    name_latin TEXT NOT NULL,
    desc_en TEXT NOT NULL DEFAULT '',
    desc_fr TEXT NOT NULL DEFAULT '',
    cuisine TEXT NOT NULL DEFAULT '',
    servings INTEGER NOT NULL DEFAULT 4,
    prep_min INTEGER NOT NULL DEFAULT 0,
    cook_min INTEGER NOT NULL DEFAULT 0,
    macros TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    recipe_ar TEXT NOT NULL,
    tags TEXT NOT NULL,
    photo_url TEXT,
    photo_credit TEXT,
    photo_license TEXT,
    photo_source_url TEXT,
    status TEXT NOT NULL DEFAULT 'ready',
    reviewed INTEGER NOT NULL DEFAULT 0,
    is_custom INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER,
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS picks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    meal TEXT NOT NULL,
    dish_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS picks_one_per_meal ON picks (day, meal, person_id)`,
  `CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    person_id INTEGER NOT NULL,
    owner_device INTEGER NOT NULL DEFAULT 0,
    label TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    last_seen_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE TABLE IF NOT EXISTS pools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    day TEXT NOT NULL,
    meal TEXT NOT NULL,
    dish_id INTEGER NOT NULL,
    added_by INTEGER,
    created_at TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS pools_day_meal_dish ON pools(day, meal, dish_id)`,
  /** One-off data fixes leave a marker here so they run exactly once per database. */
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
  )`,
];

/**
 * Data fixes that must run once and never again, keyed by name. The menu was emptied on
 * 2026-09-20 so it could be built again by hand from the library; without the marker a later
 * deploy would empty it a second time and undo whatever was picked since.
 */
const ONE_OFFS: { key: string; run: () => Promise<void> }[] = [
  {
    key: "menu_emptied_2026_09_20",
    run: async () => {
      const now = new Date().toISOString();
      await db.run(sql`UPDATE dishes SET on_menu = 0, removed_at = ${now} WHERE on_menu = 1`);
    },
  },
];

/** Columns added after a table shipped. "duplicate column" is swallowed. */
const LATE_COLUMNS = [
  `ALTER TABLE dishes ADD COLUMN on_menu INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE dishes ADD COLUMN removed_at TEXT`,
  `ALTER TABLE dishes ADD COLUMN removed_by INTEGER`,
  `ALTER TABLE people ADD COLUMN dislikes TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE people ADD COLUMN is_owner INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE people ADD COLUMN theme TEXT NOT NULL DEFAULT 'system'`,
  `ALTER TABLE dishes ADD COLUMN in_main INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE dishes ADD COLUMN is_lean INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE dishes ADD COLUMN video_url TEXT`,
  // USDA MyPlate Kitchen import, 2026-09-22.
  `ALTER TABLE dishes ADD COLUMN recipe_en TEXT NOT NULL DEFAULT '{"steps":[],"tips":[]}'`,
  `ALTER TABLE dishes ADD COLUMN recipe_fr TEXT NOT NULL DEFAULT '{"steps":[],"tips":[]}'`,
  `ALTER TABLE dishes ADD COLUMN meals TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE dishes ADD COLUMN categories TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE dishes ADD COLUMN food_groups TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE dishes ADD COLUMN nutrition TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE dishes ADD COLUMN rating REAL`,
  `ALTER TABLE dishes ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE dishes ADD COLUMN source_url TEXT`,
  `ALTER TABLE dishes ADD COLUMN source_text TEXT`,
];

/** The household on day one. Everything is renameable from the People screen. */
const SEED: Seed[] = [
  { name: "Ali", role: "family", lang: "en", isAdmin: true, isOwner: true, sortOrder: 1, dislikes: ["peppers", "raw_onion"] },
  { name: "Papa", role: "family", lang: "fr", isAdmin: true, sortOrder: 2 },
  { name: "Mama", role: "family", lang: "fr", isAdmin: true, sortOrder: 3 },
  { name: "Anas", role: "family", lang: "en", isChild: true, sortOrder: 4 },
  { name: "Layla", role: "family", lang: "en", isChild: true, simpleUi: true, sortOrder: 5 },
  { name: "Amsterdam", role: "family", lang: "en", isAway: true, sortOrder: 6 },
  { name: "الطباخة", role: "cook", lang: "ar", sortOrder: 9 },
];

let done: Promise<void> | null = null;

export function ensureSchema(): Promise<void> {
  done ??= (async () => {
    for (const ddl of DDL) await db.run(sql.raw(ddl));
    for (const ddl of LATE_COLUMNS) {
      try { await db.run(sql.raw(ddl)); } catch { /* already there */ }
    }
    // A dish removed before the library existed is simply off the menu now.
    await db.run(sql`UPDATE dishes SET on_menu = 0 WHERE removed_at IS NOT NULL AND on_menu = 1`);
    // Dishes from before the multi-meal column belong to their primary meal only.
    await db.run(sql`UPDATE dishes SET meals = '["' || meal || '"]' WHERE meals = '[]'`);
    for (const fix of ONE_OFFS) {
      const seen = await db.all<{ key: string }>(sql`SELECT key FROM settings WHERE key = ${fix.key}`);
      if (seen.length) continue;
      await fix.run();
      await db.run(sql`INSERT INTO settings (key, value) VALUES (${fix.key}, ${new Date().toISOString()})`);
    }
    const [row] = await db.select({ n: sql<number>`count(*)` }).from(people);
    if (Number(row?.n ?? 0) === 0) {
      const now = new Date().toISOString();
      await db.insert(people).values(SEED.map((p) => ({ ...p, createdAt: now })));
    }
    // Exactly one owner: the first admin named Ali, or the first admin.
    await db.run(sql`UPDATE people SET is_owner = 1 WHERE id = (
      SELECT id FROM people WHERE is_admin = 1 ORDER BY (name = 'Ali') DESC, id ASC LIMIT 1
    ) AND NOT EXISTS (SELECT 1 FROM people WHERE is_owner = 1)`);
    const [d] = await db.select({ n: sql<number>`count(*)` }).from(dishes);
    if (Number(d?.n ?? 0) === 0) await seedDishes();
  })().catch((e) => {
    done = null; // let the next request retry
    throw e;
  });
  return done;
}
