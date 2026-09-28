/**
 * A person's own menu (Ali's, for now). Independent of the family menu: a list of healthy,
 * protein-rich dishes per meal, built from the library by rule and adjustable by hand. The
 * evening before, the person picks up to three options per meal from it; the cook sees the
 * options and cooks whichever suits what is in the kitchen.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, myMenu, myPicks, people, MEALS, type Dish, type Meal, type Person } from "@/db/schema";
import { ratingScore } from "./menuFill";

export const MY_PICKS_PER_MEAL = 3;

const fatShare = (d: Dish) => {
  const kcal = d.macros?.kcal ?? 0;
  return kcal > 0 ? ((d.macros?.fat_g ?? 0) * 9) / kcal : 1;
};
const has = (d: Dish, c: string) => (d.categories ?? []).includes(c as never);
const eats = (d: Dish, m: Meal) => (d.meals ?? []).includes(m);

/**
 * The meals a dish qualifies for in a healthy personal menu, or none. Breakfast: a breakfast
 * dish with 8 g protein or more and fat under 40% of calories, or any breakfast-time dish with
 * 12 g or more and fat under 35%. Lunch and dinner: a main, sandwich or soup with 20 g protein
 * or more, fat under 35%, at least 3 g fibre and a real plate (200 kcal or more). Anything the
 * person does not eat is out.
 */
export function healthyFor(d: Dish, dislikes: string[]): Meal[] {
  if (d.status !== "ready" || !d.photoUrl) return [];
  if ((d.tags ?? []).some((t) => dislikes.includes(t))) return [];
  const p = d.macros?.protein_g ?? 0, fibre = d.macros?.fiber_g ?? 0, kcal = d.macros?.kcal ?? 0, fat = fatShare(d);
  const out: Meal[] = [];
  const breakfast = (has(d, "breakfast") && p >= 8 && fat < 0.4) || (eats(d, "breakfast") && !has(d, "dessert") && p >= 12 && fat < 0.35);
  if (breakfast) out.push("breakfast");
  if ((has(d, "main") || has(d, "sandwich") || has(d, "soup")) && p >= 20 && fat < 0.35 && fibre >= 3 && kcal >= 200) out.push("lunch", "dinner");
  return out;
}

export type MyMenuDish = { dish: Dish; meals: Meal[] };

/** The person's own menu, best rated first, one entry per dish with the meals it is on. */
export async function getMyMenu(personId: number): Promise<MyMenuDish[]> {
  await ensureSchema();
  const rows = await db.select().from(myMenu).where(eq(myMenu.personId, personId));
  if (rows.length === 0) return [];
  const ds = await db.select().from(dishes).where(inArray(dishes.id, [...new Set(rows.map((r) => r.dishId))]));
  const meals = new Map<number, Meal[]>();
  for (const r of rows) meals.set(r.dishId, [...(meals.get(r.dishId) ?? []), r.meal]);
  return ds
    .filter((d) => d.status === "ready")
    .map((dish) => ({ dish, meals: MEALS.filter((m) => meals.get(dish.id)?.includes(m)) }))
    .sort((a, b) => ratingScore(b.dish) - ratingScore(a.dish));
}

/** Put a dish on, or take it off, the person's own menu for one meal. Off also drops it from tomorrow's options. */
export async function setMyMenuMeal(personId: number, dishId: number, meal: Meal, on: boolean): Promise<void> {
  await ensureSchema();
  if (on) {
    await db.insert(myMenu).values({ personId, dishId, meal, createdAt: new Date().toISOString() }).onConflictDoNothing();
  } else {
    await db.delete(myMenu).where(and(eq(myMenu.personId, personId), eq(myMenu.dishId, dishId), eq(myMenu.meal, meal)));
    await db.delete(myPicks).where(and(eq(myPicks.personId, personId), eq(myPicks.dishId, dishId), eq(myPicks.meal, meal)));
  }
}

export type BuildReport = { added: Record<Meal, number>; total: Record<Meal, number>; names: Record<Meal, string[]> };

/** Fill the person's own menu with every library dish that passes `healthyFor`. Only ever adds. */
export async function buildMyMenu(person: Person, dry = false): Promise<BuildReport> {
  await ensureSchema();
  const all = await db.select().from(dishes).where(eq(dishes.status, "ready"));
  const have = new Set((await db.select().from(myMenu).where(eq(myMenu.personId, person.id))).map((r) => `${r.dishId}:${r.meal}`));
  const added: Record<Meal, number> = { breakfast: 0, lunch: 0, dinner: 0 };
  const names: Record<Meal, string[]> = { breakfast: [], lunch: [], dinner: [] };
  const now = new Date().toISOString();
  for (const d of all.sort((a, b) => ratingScore(b) - ratingScore(a))) {
    for (const meal of healthyFor(d, person.dislikes ?? [])) {
      if (have.has(`${d.id}:${meal}`)) continue;
      have.add(`${d.id}:${meal}`);
      added[meal]++;
      names[meal].push(d.nameEn);
      if (!dry) await db.insert(myMenu).values({ personId: person.id, dishId: d.id, meal, createdAt: now }).onConflictDoNothing();
    }
  }
  const total: Record<Meal, number> = { breakfast: 0, lunch: 0, dinner: 0 };
  for (const key of have) total[key.split(":")[1] as Meal]++;
  return { added, total, names };
}

export type MyOption = { meal: Meal; dish: Dish };

/** The person's options for a day, in the order they were tapped. */
export async function getMyOptions(day: string, personId: number): Promise<MyOption[]> {
  await ensureSchema();
  const rows = await db.select().from(myPicks).where(and(eq(myPicks.day, day), eq(myPicks.personId, personId))).orderBy(asc(myPicks.id));
  if (rows.length === 0) return [];
  const ds = await db.select().from(dishes).where(inArray(dishes.id, rows.map((r) => r.dishId)));
  const byId = new Map(ds.map((d) => [d.id, d]));
  return rows.flatMap((r) => (byId.get(r.dishId) ? [{ meal: r.meal, dish: byId.get(r.dishId)! }] : []));
}

/**
 * Add a dish to, or remove it from, the person's options for one meal of one day. Returns the
 * dish ids now chosen for that meal, or "full" (three already) or "not-mine" (not on their menu).
 */
export async function toggleMyPick(day: string, personId: number, meal: Meal, dishId: number): Promise<number[] | "full" | "not-mine"> {
  await ensureSchema();
  const current = await db.select().from(myPicks).where(and(eq(myPicks.day, day), eq(myPicks.personId, personId), eq(myPicks.meal, meal))).orderBy(asc(myPicks.id));
  const hit = current.find((r) => r.dishId === dishId);
  if (hit) {
    await db.delete(myPicks).where(eq(myPicks.id, hit.id));
    return current.filter((r) => r.id !== hit.id).map((r) => r.dishId);
  }
  const [mine] = await db.select({ id: myMenu.id }).from(myMenu).where(and(eq(myMenu.personId, personId), eq(myMenu.dishId, dishId), eq(myMenu.meal, meal)));
  if (!mine) return "not-mine";
  if (current.length >= MY_PICKS_PER_MEAL) return "full";
  await db.insert(myPicks).values({ day, personId, meal, dishId, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return [...current.map((r) => r.dishId), dishId];
}

/** Everyone who eats from a menu of their own and is at home. */
export async function ownMenuPeople(): Promise<Person[]> {
  await ensureSchema();
  return (await db.select().from(people).where(eq(people.ownMenu, true))).filter((p) => !p.isAway);
}
