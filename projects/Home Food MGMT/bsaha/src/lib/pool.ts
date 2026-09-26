import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, picks, pools, type Dish, type Meal } from "@/db/schema";

export const TZ = "Africa/Casablanca";
/** Options per meal per day in the weekly plan (see week.ts). Kept for the old shortlist screen. */
export const POOL_PER_MEAL = 2;
export const POOL_MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
/**
 * Morocco time this evening after which tomorrow's choices are final. No scheduled job:
 * every screen compares the clock to this hour, so the lock needs no infrastructure.
 */
export const LOCK_HOUR = 20;

/** YYYY-MM-DD in Morocco, `offsetDays` from today. */
export function dayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const tomorrowKey = () => dayKey(1);

/** Hour of the day, 0-23, in Morocco. */
export function hourNow(): number {
  // h23 explicitly: some locales render midnight as "24" under hour12:false.
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
}

/** True once tomorrow's choices are final: from LOCK_HOUR this evening until midnight. */
export const isLocked = () => hourNow() >= LOCK_HOUR;

/** LOCK_HOUR as "20:00", for the deadline line on screen. */
export const lockLabel = () => `${String(LOCK_HOUR).padStart(2, "0")}:00`;

export type PoolDish = { meal: Meal; dish: Dish };

async function withDishes<T extends { dishId: number; meal: Meal }>(rows: T[]): Promise<(T & { dish: Dish })[]> {
  if (rows.length === 0) return [];
  const ds = await db.select().from(dishes).where(inArray(dishes.id, rows.map((r) => r.dishId)));
  const byId = new Map(ds.map((d) => [d.id, d]));
  return rows.flatMap((r) => (byId.get(r.dishId) ? [{ ...r, dish: byId.get(r.dishId)! }] : []));
}

export async function getPool(day: string): Promise<PoolDish[]> {
  await ensureSchema();
  const rows = await db.select().from(pools).where(eq(pools.day, day)).orderBy(asc(pools.id));
  return withDishes(rows);
}

/** Add or remove one dish. Returns the new count for that meal, or -1 if the meal was already full. */
export async function togglePoolRow(day: string, meal: Meal, dishId: number, by: number | null): Promise<number> {
  await ensureSchema();
  const existing = await db.select().from(pools).where(and(eq(pools.day, day), eq(pools.meal, meal)));
  const hit = existing.find((r) => r.dishId === dishId);
  if (hit) {
    await db.delete(pools).where(and(eq(pools.day, day), eq(pools.meal, meal), eq(pools.dishId, dishId)));
    // A dish that leaves the shortlist cannot stay chosen.
    await db.delete(picks).where(and(eq(picks.day, day), eq(picks.meal, meal), eq(picks.dishId, dishId)));
    return existing.length - 1;
  }
  if (existing.length >= POOL_PER_MEAL) return -1;
  await db.insert(pools).values({ day, meal, dishId, addedBy: by, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return existing.length + 1;
}

export type PickedDish = { meal: Meal; personId: number; dish: Dish };

export async function getPicks(day: string): Promise<PickedDish[]> {
  await ensureSchema();
  const rows = await db.select().from(picks).where(eq(picks.day, day)).orderBy(asc(picks.id));
  return withDishes(rows);
}

/** One person's choices for a day, keyed by meal. */
export async function getMyPicks(day: string, personId: number): Promise<Partial<Record<Meal, number>>> {
  await ensureSchema();
  const rows = await db.select().from(picks).where(and(eq(picks.day, day), eq(picks.personId, personId)));
  return Object.fromEntries(rows.map((r) => [r.meal, r.dishId]));
}

/**
 * Choose a dish for one meal, or tap the chosen one again to undo. The dish must be in that
 * day's pool, and nothing moves once the evening lock has passed.
 * Returns the dish now chosen, null if the choice was cleared, or "locked" / "not-in-pool".
 */
export async function setPick(
  day: string, meal: Meal, dishId: number, personId: number,
): Promise<number | null | "locked" | "not-in-pool"> {
  await ensureSchema();
  if (isLocked()) return "locked";
  if (meal === "breakfast") {
    // Breakfast is individual: any breakfast dish on the menu.
    const [d] = await db.select({ menuMeals: dishes.menuMeals, status: dishes.status }).from(dishes).where(eq(dishes.id, dishId));
    const ok = d && d.status === "ready" && (d.menuMeals ?? []).includes("breakfast");
    if (!ok) return "not-in-pool";
  } else {
    const [inPool] = await db.select({ id: pools.id }).from(pools)
      .where(and(eq(pools.day, day), eq(pools.meal, meal), eq(pools.dishId, dishId)));
    if (!inPool) return "not-in-pool";
  }

  const [mine] = await db.select().from(picks)
    .where(and(eq(picks.day, day), eq(picks.meal, meal), eq(picks.personId, personId)));
  if (mine?.dishId === dishId) {
    await db.delete(picks).where(eq(picks.id, mine.id));
    return null;
  }
  if (mine) {
    await db.update(picks).set({ dishId }).where(eq(picks.id, mine.id));
    return dishId;
  }
  await db.insert(picks).values({ day, meal, dishId, personId, createdAt: new Date().toISOString() });
  return dishId;
}

/** Breakfast is not planned: everyone picks from every breakfast dish on the menu. */
export async function breakfastMenu(): Promise<Dish[]> {
  await ensureSchema();
  const rows = await db.select().from(dishes).where(and(eq(dishes.status, "ready"), eq(dishes.onMenu, true))).orderBy(asc(dishes.nameEn));
  return rows.filter((d) => (d.menuMeals ?? []).includes("breakfast"));
}
