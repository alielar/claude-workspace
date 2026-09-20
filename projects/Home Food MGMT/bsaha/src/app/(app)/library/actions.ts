"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { dishes, picks, pools, MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { forgetSlimDishes } from "@/lib/slim";

/** Put a dish on the menu, or take it off and leave it in the library. */
export async function setOnMenu(id: number, on: boolean): Promise<boolean> {
  const me = await currentPerson();
  if (!me?.isAdmin || !Number.isFinite(id)) return false;

  await db
    .update(dishes)
    .set(on ? { onMenu: true, removedAt: null, removedBy: null } : { onMenu: false, removedAt: new Date().toISOString(), removedBy: me.id })
    .where(eq(dishes.id, id));

  if (!on) {
    // A dish off the menu cannot stay in a shortlist or in anyone's choice.
    await db.delete(pools).where(eq(pools.dishId, id));
    await db.delete(picks).where(eq(picks.dishId, id));
  }
  forgetSlimDishes();
  revalidatePath("/", "layout");
  return true;
}

/** Take every dish of one meal off the menu, to build that meal's list again from scratch. */
export async function clearMenuForMeal(meal: Meal): Promise<number> {
  const me = await currentPerson();
  if (!me?.isAdmin || !MEALS.includes(meal)) return 0;

  const on = await db.select({ id: dishes.id }).from(dishes).where(and(eq(dishes.meal, meal), eq(dishes.onMenu, true)));
  if (on.length === 0) return 0;

  await db
    .update(dishes)
    .set({ onMenu: false, removedAt: new Date().toISOString(), removedBy: me.id })
    .where(and(eq(dishes.meal, meal), eq(dishes.onMenu, true)));
  for (const d of on) {
    await db.delete(pools).where(eq(pools.dishId, d.id));
    await db.delete(picks).where(eq(picks.dishId, d.id));
  }
  forgetSlimDishes();
  revalidatePath("/", "layout");
  return on.length;
}
