/** Dev check: seeds the library into TURSO_DATABASE_URL, then plans a week and builds a grocery list. Run: TURSO_DATABASE_URL=file:/tmp/t.db npx tsx scripts/myplate/seedtest.ts */
import { ensureSchema } from "@/db/migrate";
import { db } from "@/db";
import { sql } from "drizzle-orm";
import { buildGroceryList } from "@/lib/grocery";
import { suggestWeek, weekDays, getWeekPlan } from "@/lib/week";
async function main() {
  await ensureSchema();
  const n = await db.all<{ n: number }>(sql`SELECT count(*) n FROM dishes`);
  const m = await db.all<{ meals: string; n: number }>(sql`SELECT meals, count(*) n FROM dishes GROUP BY meals`);
  const c = await db.all<{ c: string; n: number }>(sql`SELECT json_extract(categories,'$[0]') c, count(*) n FROM dishes GROUP BY c ORDER BY n DESC`);
  const ar = await db.all<{ n: number }>(sql`SELECT count(*) n FROM dishes WHERE json_array_length(json_extract(recipe_ar,'$.steps')) > 0`);
  console.log("dishes", n[0].n, "with darija", ar[0].n); console.log(m); console.log(c);
  // put 60 dishes on the menu, then plan a week and build a grocery list
  await db.run(sql`UPDATE dishes SET on_menu = 1 WHERE id IN (SELECT id FROM dishes WHERE rating IS NOT NULL ORDER BY rating DESC LIMIT 60)`);
  const added = await suggestWeek(weekDays(), null);
  const plan = await getWeekPlan(weekDays());
  console.log("suggested", added, "slots", plan.length, plan.slice(0, 4).map((s) => `${s.day} ${s.meal} ${s.dish.nameEn}`));
  const g = await buildGroceryList(weekDays());
  console.log("grocery people", g.people, "fresh", g.fresh.length, "dry", g.dry.length, "breakfast", g.breakfast.length);
  console.log(g.fresh.slice(0, 5).map((l) => `${l.en} ${l.qty}${l.unit} (${l.dishes.length})`), g.breakfast.slice(0, 5).map((l) => `${l.en} ${l.qty}${l.unit}`));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
