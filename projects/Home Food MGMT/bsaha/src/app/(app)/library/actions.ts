"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { dishes, picks, pools, MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { forgetSlimDishes } from "@/lib/slim";

/** A dish's menu meals after adding or removing one. */
function withMeal(current: Meal[], meal: Meal, on: boolean): Meal[] {
  const set = new Set(current);
  if (on) set.add(meal); else set.delete(meal);
  return MEALS.filter((m) => set.has(m));
}

/** Put a dish on the menu of one meal, or take it off that meal's menu. It stays in the library. */
export async function setOnMenu(id: number, meal: Meal, on: boolean): Promise<boolean> {
  const me = await currentPerson();
  if (!me?.isAdmin || !Number.isFinite(id) || !MEALS.includes(meal)) return false;
  const [d] = await db.select({ menuMeals: dishes.menuMeals }).from(dishes).where(eq(dishes.id, id));
  if (!d) return false;
  const next = withMeal(d.menuMeals ?? [], meal, on);
  await db
    .update(dishes)
    .set(next.length
      ? { menuMeals: next, onMenu: true, removedAt: null, removedBy: null }
      : { menuMeals: next, onMenu: false, removedAt: new Date().toISOString(), removedBy: me.id })
    .where(eq(dishes.id, id));

  if (!on) {
    // Off the menu for this meal: it cannot stay in that meal's shortlist or in anyone's choice for it.
    await db.delete(pools).where(and(eq(pools.dishId, id), eq(pools.meal, meal)));
    await db.delete(picks).where(and(eq(picks.dishId, id), eq(picks.meal, meal)));
  }
  forgetSlimDishes();
  revalidatePath("/", "layout");
  return true;
}

/** Take every dish off the menu, all three meals, to build the whole menu again from scratch. */
export async function clearWholeMenu(): Promise<number> {
  const me = await currentPerson();
  if (!me?.isAdmin) return 0;

  const on = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.onMenu, true));
  if (on.length === 0) return 0;

  await db
    .update(dishes)
    .set({ menuMeals: [], onMenu: false, removedAt: new Date().toISOString(), removedBy: me.id })
    .where(eq(dishes.onMenu, true));
  for (const d of on) {
    await db.delete(pools).where(eq(pools.dishId, d.id));
    await db.delete(picks).where(eq(picks.dishId, d.id));
  }
  forgetSlimDishes();
  revalidatePath("/", "layout");
  return on.length;
}

/**
 * Delete a dish for good: it disappears from the library, the menu, every shortlist and every
 * choice. The row stays behind with status "deleted" so the library refresh that runs after each
 * deploy (upsert by slug) cannot bring it back. Nothing in the app reads a deleted row.
 */
export async function deleteDishForGood(id: number): Promise<boolean> {
  const me = await currentPerson();
  if (!me?.isAdmin || !Number.isFinite(id)) return false;

  await db
    .update(dishes)
    .set({ status: "deleted", onMenu: false, removedAt: new Date().toISOString(), removedBy: me.id })
    .where(eq(dishes.id, id));
  await db.delete(pools).where(eq(pools.dishId, id));
  await db.delete(picks).where(eq(picks.dishId, id));
  forgetSlimDishes();
  revalidatePath("/", "layout");
  return true;
}

/** Take every dish off one meal's menu, to build that meal's list again from scratch. */
export async function clearMenuForMeal(meal: Meal): Promise<number> {
  const me = await currentPerson();
  if (!me?.isAdmin || !MEALS.includes(meal)) return 0;

  const on = await db.select({ id: dishes.id, menuMeals: dishes.menuMeals }).from(dishes)
    .where(sql`${dishes.menuMeals} LIKE ${`%"${meal}"%`}`);
  if (on.length === 0) return 0;

  const now = new Date().toISOString();
  for (const d of on) {
    const next = withMeal(d.menuMeals ?? [], meal, false);
    await db.update(dishes)
      .set(next.length ? { menuMeals: next } : { menuMeals: next, onMenu: false, removedAt: now, removedBy: me.id })
      .where(eq(dishes.id, d.id));
    await db.delete(pools).where(and(eq(pools.dishId, d.id), eq(pools.meal, meal)));
    await db.delete(picks).where(and(eq(picks.dishId, d.id), eq(picks.meal, meal)));
  }
  forgetSlimDishes();
  revalidatePath("/", "layout");
  return on.length;
}
