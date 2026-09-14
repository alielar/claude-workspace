"use server";

import { revalidatePath } from "next/cache";
import { MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { togglePoolRow, tomorrowKey } from "@/lib/pool";

/** Cook or admin toggles a dish in tomorrow's pool. */
export async function togglePool(meal: Meal, dishId: number): Promise<number> {
  const me = await currentPerson();
  if (!me || (me.role !== "cook" && !me.isAdmin)) return -2;
  if (!MEALS.includes(meal) || !Number.isFinite(dishId)) return -2;
  const n = await togglePoolRow(tomorrowKey(), meal, dishId, me.id);
  revalidatePath("/pool");
  revalidatePath("/today");
  return n;
}
