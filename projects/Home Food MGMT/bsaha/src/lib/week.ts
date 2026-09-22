/**
 * The weekly plan. Every day of the coming week gets two options for lunch and two for dinner
 * (rows in `pools`), the family votes between the two the evening before (rows in `picks`), and
 * the grocery list is built from the plan. Breakfast is not planned: each person picks their own
 * from the breakfast dishes on the menu.
 */
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, people, picks, pools, type Dish, type Meal, type Person } from "@/db/schema";
import { dayKey, getPool, type PoolDish, type PickedDish } from "./pool";
import { inMeal } from "./dishMeta";
import { toSlim } from "./slim";

export const PLAN_MEALS: Meal[] = ["lunch", "dinner"];
export const PLAN_PER_MEAL = 2;
export const WEEK_DAYS = 7;
/** The household never cooks for fewer than this. */
export const MIN_HEADCOUNT = 3;

/** The seven days the plan covers: tomorrow onwards. */
export function weekDays(): string[] {
  return Array.from({ length: WEEK_DAYS }, (_, i) => dayKey(i + 1));
}

/** Weekday name for a YYYY-MM-DD key, in the reader's language. */
export function dayLabel(day: string, lang: "en" | "fr" | "ar"): string {
  const d = new Date(`${day}T12:00:00Z`);
  const locale = lang === "ar" ? "ar-MA" : lang === "fr" ? "fr-MA" : "en-GB";
  return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

export type Slot = { day: string; meal: Meal; dish: Dish };

export async function getWeekPlan(days: string[]): Promise<Slot[]> {
  await ensureSchema();
  const rows = await db.select().from(pools).where(and(gte(pools.day, days[0]), lte(pools.day, days[days.length - 1]))).orderBy(asc(pools.id));
  if (rows.length === 0) return [];
  const ds = await db.select().from(dishes).where(inArray(dishes.id, rows.map((r) => r.dishId)));
  const byId = new Map(ds.map((d) => [d.id, d]));
  return rows.flatMap((r) => (byId.get(r.dishId) && PLAN_MEALS.includes(r.meal) ? [{ day: r.day, meal: r.meal, dish: byId.get(r.dishId)! }] : []));
}

/** Put a dish in one of the two slots of a day and meal. Returns false when both slots are taken. */
export async function addSlot(day: string, meal: Meal, dishId: number, by: number | null): Promise<boolean> {
  await ensureSchema();
  const existing = await db.select().from(pools).where(and(eq(pools.day, day), eq(pools.meal, meal)));
  if (existing.some((r) => r.dishId === dishId)) return true;
  if (existing.length >= PLAN_PER_MEAL) return false;
  await db.insert(pools).values({ day, meal, dishId, addedBy: by, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return true;
}

export async function removeSlot(day: string, meal: Meal, dishId: number): Promise<void> {
  await ensureSchema();
  await db.delete(pools).where(and(eq(pools.day, day), eq(pools.meal, meal), eq(pools.dishId, dishId)));
  await db.delete(picks).where(and(eq(picks.day, day), eq(picks.meal, meal), eq(picks.dishId, dishId)));
}

/** How many people the kitchen plans for: family members at home, never fewer than MIN_HEADCOUNT. */
export async function headcount(): Promise<number> {
  await ensureSchema();
  const rows = await db.select({ isAway: people.isAway }).from(people).where(eq(people.role, "family"));
  return Math.max(MIN_HEADCOUNT, rows.filter((p) => !p.isAway).length);
}

/**
 * Which of the day's options gets cooked. Most votes wins; a tie goes to the better rated dish,
 * then to the one added first. No votes at all means the cook decides (null).
 */
export function settle(meal: Meal, pool: PoolDish[], votes: PickedDish[]): { winner: Dish | null; tally: Map<number, number> } {
  const options = pool.filter((p) => p.meal === meal);
  const tally = new Map<number, number>(options.map((o) => [o.dish.id, 0]));
  for (const v of votes) if (v.meal === meal && tally.has(v.dish.id)) tally.set(v.dish.id, (tally.get(v.dish.id) ?? 0) + 1);
  const total = [...tally.values()].reduce((a, b) => a + b, 0);
  if (total === 0 || options.length === 0) return { winner: null, tally };
  const ranked = [...options].sort((a, b) =>
    (tally.get(b.dish.id) ?? 0) - (tally.get(a.dish.id) ?? 0) || (b.dish.rating ?? 0) - (a.dish.rating ?? 0));
  return { winner: ranked[0].dish, tally };
}

/** Ingredient identity across dishes: "Onion, chopped" and "onions" both become "onion". */
export function ingredientKey(en: string): string {
  let k = en.toLowerCase().split(",")[0].split("(")[0];
  k = k.replace(/\b(fresh|frozen|canned|dried|chopped|diced|sliced|minced|grated|shredded|crushed|large|small|medium|ripe|boneless|skinless|lean|low[- ]fat|non[- ]fat|reduced[- ]fat|fat[- ]free|unsalted|salted|whole|cooked|raw|plain|light|extra|virgin|ground|peeled|cubed|thinly|finely|coarsely|or\b.*)\b/g, " ");
  k = k.replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  if (k.endsWith("oes")) k = k.slice(0, -2);
  else if (k.endsWith("ies")) k = k.slice(0, -3) + "y";
  else if (k.endsWith("s") && !k.endsWith("ss")) k = k.slice(0, -1);
  return k;
}

const PROTEIN_TAGS = ["chicken", "fish", "red_meat", "eggs", "legumes"];

/**
 * Fills the empty slots of the week. Picks from the menu (main menu only), never the same dish
 * twice in the week nor anything planned in the previous two weeks, prefers well rated and
 * protein-rich dishes, alternates the main protein and category day to day, and pairs the two
 * options of a day so that everyone in the house can eat at least one of them.
 */
export async function suggestWeek(days: string[], by: number | null): Promise<number> {
  await ensureSchema();
  const [all, plan, family] = await Promise.all([
    db.select().from(dishes).where(and(eq(dishes.status, "ready"), eq(dishes.onMenu, true), eq(dishes.inMain, true))),
    getWeekPlan(days),
    db.select().from(people).where(eq(people.role, "family")),
  ]);
  const recent = await db.select({ dishId: pools.dishId }).from(pools).where(and(gte(pools.day, dayKey(-14)), lte(pools.day, dayKey(0))));
  const used = new Set<number>([...recent.map((r) => r.dishId), ...plan.map((s) => s.dish.id)]);
  const dislikes = family.filter((p) => !p.isAway).map((p: Person) => new Set(p.dislikes ?? []));
  const slim = new Map(all.map((d) => [d.id, toSlim(d)]));
  const disliked = (d: Dish) => dislikes.filter((set) => (d.tags ?? []).some((t) => set.has(t))).length;
  const proteinOf = (d: Dish) => (d.tags ?? []).find((t) => PROTEIN_TAGS.includes(t)) ?? "other";

  let added = 0;
  for (const meal of PLAN_MEALS) {
    let prev: Dish | null = null;
    for (const day of days) {
      const have = plan.filter((s) => s.day === day && s.meal === meal).map((s) => s.dish);
      const chosen: Dish[] = [...have];
      while (chosen.length < PLAN_PER_MEAL) {
        const partner = chosen[0] ?? null;
        const candidates = all.filter((d) => !used.has(d.id) && inMeal(slim.get(d.id)!, meal) && (d.categories ?? []).some((c) => c === "main" || c === "soup" || c === "salad" || c === "sandwich") || (!used.has(d.id) && inMeal(slim.get(d.id)!, meal) && (d.categories ?? []).length === 0));
        if (candidates.length === 0) break;
        const scored = candidates.map((d) => {
          let s = (d.rating ?? 3) + Math.min(2, (d.macros?.protein_g ?? 0) / 15);
          s -= disliked(d) * 1.5;
          if (prev && proteinOf(prev) === proteinOf(d)) s -= 0.8;
          if (prev && (prev.categories ?? [])[0] === (d.categories ?? [])[0]) s -= 0.3;
          if (partner) {
            if (proteinOf(partner) === proteinOf(d)) s -= 0.5;
            // the two options should not both be off limits for the same person
            for (const set of dislikes) if ((partner.tags ?? []).some((t) => set.has(t)) && (d.tags ?? []).some((t) => set.has(t))) s -= 3;
            // shared ingredients make the shopping list shorter
            const keys = new Set((partner.ingredients ?? []).map((i) => ingredientKey(i.en)));
            s += Math.min(1, (d.ingredients ?? []).filter((i) => keys.has(ingredientKey(i.en))).length * 0.2);
          }
          s += Math.random() * 0.6;
          return { d, s };
        }).sort((a, b) => b.s - a.s);
        const pick = scored[0].d;
        if (await addSlot(day, meal, pick.id, by)) { chosen.push(pick); used.add(pick.id); added++; }
        else break;
      }
      prev = chosen[chosen.length - 1] ?? prev;
    }
  }
  return added;
}

/** Everything the cook needs for one day: the options, the votes and the winner per meal. */
export async function dayResult(day: string, votes: PickedDish[]) {
  const pool = await getPool(day);
  return PLAN_MEALS.map((meal) => ({ meal, options: pool.filter((p) => p.meal === meal), ...settle(meal, pool, votes) }));
}
