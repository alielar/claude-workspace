"use server";

import { revalidatePath } from "next/cache";
import { MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { setPick, tomorrowKey } from "@/lib/pool";

export type PickResult = { ok: true; dishId: number | null } | { ok: false; reason: "locked" | "not-in-pool" | "denied" };

/** Choose tomorrow's dish for one meal, or tap the chosen one again to clear it. */
export async function choose(meal: Meal, dishId: number): Promise<PickResult> {
  const me = await currentPerson();
  if (!me || me.role === "grocery") return { ok: false, reason: "denied" };
  if (!MEALS.includes(meal) || !Number.isFinite(dishId)) return { ok: false, reason: "denied" };

  const r = await setPick(tomorrowKey(), meal, dishId, me.id);
  if (r === "locked" || r === "not-in-pool") return { ok: false, reason: r };

  revalidatePath("/tomorrow");
  revalidatePath("/today");
  return { ok: true, dishId: r };
}
