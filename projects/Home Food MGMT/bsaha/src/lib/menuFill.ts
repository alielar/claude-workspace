import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, MEALS, type Dish, type Meal } from "@/db/schema";
import { forgetSlimDishes } from "@/lib/slim";

/** How many dishes per meal the menu is meant to hold (same number the Library screen shows). */
export const MENU_TARGET = 30;

/**
 * A rating that a handful of votes cannot inflate: a 5.0 from 3 people lands below a 4.4 from
 * 300. Unrated dishes sit at the bottom.
 */
export function ratingScore(d: Pick<Dish, "rating" | "ratingCount">): number {
  if (d.rating == null) return 0;
  const n = d.ratingCount ?? 0;
  return (d.rating * n + 3.5 * 10) / (n + 10);
}

const isBreakfast = (d: Dish) => (d.categories ?? []).includes("breakfast");
/** A dish someone would call lunch or dinner: a main, a sandwich or a soup, never a side or a sauce. */
const isMain = (d: Dish) => {
  const c = d.categories ?? [];
  return c.length === 0 ? (d.meals ?? []).some((m) => m === "lunch" || m === "dinner") : c.includes("main") || c.includes("sandwich") || c.includes("soup");
};
const on = (d: Dish, m: Meal) => (d.menuMeals ?? []).includes(m);

/** "Quick and Healthy Black-Eyed Peas" and "Quick Black-Eyed Peas" are the same dish to a family. */
const FILLER = /\b(quick|easy|healthy|simple|classic|sensational|hearty|and|with|from better baking mix|the|a)\b|[&(),'-]/g;
const sameName = (name: string) => name.toLowerCase().replace(FILLER, " ").replace(/\s+/g, " ").trim();

export type FillReport = {
  before: Record<Meal, number>;
  after: Record<Meal, number>;
  added: Record<Meal, string[]>;
  /** Dishes that were already on both lunch and dinner. Left as they are. */
  onBoth: string[];
};

/**
 * Fills each meal of the menu up to the target with the best rated dishes, keeping every dish
 * already picked. Breakfast takes breakfast dishes. Lunch and dinner take main dishes and never
 * share one: the ranked list is dealt to whichever of the two has more empty spots, so both get
 * dishes of the same quality. Nothing is ever removed. `dry` only reports what would change.
 */
export async function fillMenu(dry = false): Promise<FillReport> {
  await ensureSchema();
  const all = (await db.select().from(dishes).where(eq(dishes.status, "ready"))).filter((d) => d.photoUrl);
  const count = (m: Meal) => all.filter((d) => on(d, m)).length;
  const before = Object.fromEntries(MEALS.map((m) => [m, count(m)])) as Record<Meal, number>;
  const byScore = (a: Dish, b: Dish) => ratingScore(b) - ratingScore(a) || (b.ratingCount ?? 0) - (a.ratingCount ?? 0);
  const plan = new Map<number, Meal[]>();
  const added: Record<Meal, string[]> = { breakfast: [], lunch: [], dinner: [] };
  /** Names already on the menu (any meal) plus the ones chosen here, so no near-duplicate gets in. */
  const taken = new Set(all.filter((d) => (d.menuMeals ?? []).length).map((d) => sameName(d.nameEn)));
  const fresh = (d: Dish) => !taken.has(sameName(d.nameEn));

  // Breakfast: best rated breakfast dishes not yet picked for it.
  let bNeed = Math.max(0, MENU_TARGET - before.breakfast);
  for (const d of all.filter((d) => isBreakfast(d) && !on(d, "breakfast")).sort(byScore)) {
    if (bNeed === 0) break;
    if (!fresh(d)) continue;
    bNeed--;
    taken.add(sameName(d.nameEn));
    plan.set(d.id, [...(d.menuMeals ?? []), "breakfast"]);
    added.breakfast.push(d.nameEn);
  }

  // Lunch and dinner: one ranked list of mains, dealt to the meal with more room.
  const need: Record<"lunch" | "dinner", number> = {
    lunch: Math.max(0, MENU_TARGET - before.lunch),
    dinner: Math.max(0, MENU_TARGET - before.dinner),
  };
  const mains = all.filter((d) => isMain(d) && !on(d, "lunch") && !on(d, "dinner")).sort(byScore);
  for (const d of mains) {
    if (need.lunch === 0 && need.dinner === 0) break;
    if (!fresh(d)) continue;
    const meal: "lunch" | "dinner" = need.lunch >= need.dinner ? "lunch" : "dinner";
    need[meal]--;
    taken.add(sameName(d.nameEn));
    plan.set(d.id, MEALS.filter((m) => m === meal || (d.menuMeals ?? []).includes(m)));
    added[meal].push(d.nameEn);
  }

  if (!dry) {
    for (const [id, menuMeals] of plan) {
      await db.update(dishes).set({ menuMeals, onMenu: true, removedAt: null, removedBy: null }).where(eq(dishes.id, id));
    }
    forgetSlimDishes();
  }

  const after = Object.fromEntries(MEALS.map((m) => [m, before[m] + added[m].length])) as Record<Meal, number>;
  const onBoth = all.filter((d) => on(d, "lunch") && on(d, "dinner")).map((d) => d.nameEn);
  return { before, after, added, onBoth };
}
