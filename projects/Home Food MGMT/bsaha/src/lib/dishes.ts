import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, type Dish, type Lang, type Meal, type Person } from "@/db/schema";

/**
 * A deleted dish keeps its row with status "deleted" so a library refresh (upsert by slug)
 * cannot bring it back. Every reader below skips it; only the row's existence is remembered.
 */
const live = eq(dishes.status, "ready");
/** On the menu for this meal. */
const onMenuFor = (meal: Meal) => sql`${dishes.menuMeals} LIKE ${`%"${meal}"%`}`;

export async function listDishes(meal?: Meal): Promise<Dish[]> {
  await ensureSchema();
  const where = meal ? and(live, onMenuFor(meal)) : and(live, eq(dishes.onMenu, true));
  return db.select().from(dishes).where(where).orderBy(asc(dishes.nameEn));
}

/** Dishes in the library but not on the menu, the ones taken off most recently first. */
export async function listOffMenuDishes(): Promise<Dish[]> {
  await ensureSchema();
  return db.select().from(dishes).where(and(live, eq(dishes.onMenu, false))).orderBy(desc(dishes.removedAt), asc(dishes.nameEn));
}

/** How many dishes are on the menu for each meal. */
export async function menuCounts(): Promise<Record<string, number>> {
  await ensureSchema();
  const rows = await db.select().from(dishes).where(and(live, eq(dishes.onMenu, true)));
  const out: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const r of rows) for (const m of r.menuMeals ?? []) out[m] = (out[m] ?? 0) + 1;
  return out;
}

export async function getDish(slug: string): Promise<Dish | null> {
  await ensureSchema();
  const [d] = await db.select().from(dishes).where(and(live, eq(dishes.slug, slug)));
  return d ?? null;
}

export async function listReadyDishes(meal: Meal): Promise<Dish[]> {
  await ensureSchema();
  return db.select().from(dishes).where(and(live, onMenuFor(meal))).orderBy(asc(dishes.nameEn));
}

/** True when the dish carries a tag this person does not eat. */
export function dislikedBy(dish: Dish, person: Pick<Person, "dislikes">): boolean {
  const bad = new Set(person.dislikes ?? []);
  return (dish.tags ?? []).some((tag) => bad.has(tag));
}

export function splitByDislikes<T extends Dish>(list: T[], person: Pick<Person, "dislikes">) {
  const shown: T[] = [];
  let hidden = 0;
  for (const d of list) {
    if (dislikedBy(d, person)) hidden++;
    else shown.push(d);
  }
  return { shown, hidden };
}

export function dishName(d: Dish, lang: Lang): string {
  return lang === "ar" ? d.nameAr : lang === "fr" ? d.nameFr : d.nameEn;
}

export function dishDesc(d: Dish, lang: Lang): string {
  return lang === "fr" ? d.descFr : lang === "ar" ? "" : d.descEn;
}

// Pure helpers, kept in a module without database imports so client components can use them.
export { formatQty, ingredientName } from "./scale";
