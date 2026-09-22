"use server";

import { revalidatePath } from "next/cache";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { picks, pools, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { addSlot, PLAN_MEALS, removeSlot, suggestWeek, weekDays } from "@/lib/week";

async function planner() {
  const me = await currentPerson();
  return me && (me.role === "cook" || me.isAdmin) ? me : null;
}
const inWeek = (day: string) => weekDays().includes(day);

function refresh() {
  revalidatePath("/week"); revalidatePath("/today"); revalidatePath("/tomorrow"); revalidatePath("/grocery");
}

/** Put a dish in one of the two slots of a day and meal. False when the slots are full. */
export async function planAdd(day: string, meal: Meal, dishId: number): Promise<boolean> {
  const me = await planner();
  if (!me || !inWeek(day) || !PLAN_MEALS.includes(meal) || !Number.isFinite(dishId)) return false;
  const ok = await addSlot(day, meal, dishId, me.id);
  refresh();
  return ok;
}

export async function planRemove(day: string, meal: Meal, dishId: number): Promise<boolean> {
  const me = await planner();
  if (!me || !inWeek(day) || !PLAN_MEALS.includes(meal)) return false;
  await removeSlot(day, meal, dishId);
  refresh();
  return true;
}

/** Fill every empty slot of the week. Returns how many dishes were added. */
export async function planFill(): Promise<number> {
  const me = await planner();
  if (!me) return 0;
  const n = await suggestWeek(weekDays(), me.id);
  refresh();
  return n;
}

/** Empty the whole week (options and votes). */
export async function planClear(): Promise<boolean> {
  const me = await planner();
  if (!me) return false;
  const days = weekDays();
  const rows = await db.select({ id: pools.id, dishId: pools.dishId, day: pools.day, meal: pools.meal }).from(pools)
    .where(and(gte(pools.day, days[0]), lte(pools.day, days[days.length - 1]), inArray(pools.meal, PLAN_MEALS)));
  if (rows.length) {
    await db.delete(pools).where(inArray(pools.id, rows.map((r) => r.id)));
    await db.delete(picks).where(and(gte(picks.day, days[0]), lte(picks.day, days[days.length - 1]), inArray(picks.meal, PLAN_MEALS)));
  }
  refresh();
  return true;
}

/** Ticks on the grocery list are shared by everyone who shops, keyed by the week. */
export async function setGroceryTicks(weekStart: string, keys: string[]): Promise<boolean> {
  const me = await currentPerson();
  if (!me) return false;
  const { sql } = await import("drizzle-orm");
  await db.run(sql`INSERT INTO settings (key, value) VALUES (${`grocery:${weekStart}`}, ${JSON.stringify(keys.slice(0, 500))})
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
  revalidatePath("/grocery");
  return true;
}
