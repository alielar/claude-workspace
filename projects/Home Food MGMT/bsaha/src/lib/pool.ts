import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, pools, type Dish, type Meal } from "@/db/schema";

export const TZ = "Africa/Casablanca";
export const POOL_CAP = 10;
export const POOL_MEALS: Meal[] = ["lunch", "dinner"];

/** YYYY-MM-DD in Morocco, `offsetDays` from today. */
export function dayKey(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export const tomorrowKey = () => dayKey(1);

export type PoolDish = { meal: Meal; dish: Dish };

export async function getPool(day: string): Promise<PoolDish[]> {
  await ensureSchema();
  const rows = await db.select().from(pools).where(eq(pools.day, day)).orderBy(asc(pools.id));
  if (rows.length === 0) return [];
  const ds = await db.select().from(dishes).where(inArray(dishes.id, rows.map((r) => r.dishId)));
  const byId = new Map(ds.map((d) => [d.id, d]));
  return rows.flatMap((r) => (byId.get(r.dishId) ? [{ meal: r.meal, dish: byId.get(r.dishId)! }] : []));
}

/** Add or remove one dish. Returns the new count, or -1 if the cap was hit. */
export async function togglePoolRow(day: string, meal: Meal, dishId: number, by: number | null): Promise<number> {
  await ensureSchema();
  const existing = await db.select().from(pools).where(eq(pools.day, day));
  const hit = existing.find((r) => r.meal === meal && r.dishId === dishId);
  if (hit) {
    await db.delete(pools).where(and(eq(pools.day, day), eq(pools.meal, meal), eq(pools.dishId, dishId)));
    return existing.length - 1;
  }
  if (existing.length >= POOL_CAP) return -1;
  await db.insert(pools).values({ day, meal, dishId, addedBy: by, createdAt: new Date().toISOString() }).onConflictDoNothing();
  return existing.length + 1;
}
