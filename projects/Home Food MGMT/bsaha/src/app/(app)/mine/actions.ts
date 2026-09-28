"use server";

import { revalidatePath } from "next/cache";
import { MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { buildMyMenu, setMyMenuMeal, toggleMyPick, type BuildReport } from "@/lib/mine";
import { tomorrowKey } from "@/lib/pool";

/** Fill my own menu with every dish that passes the health rules. */
export async function buildMine(): Promise<BuildReport | null> {
  const me = await currentPerson();
  if (!me?.ownMenu) return null;
  const r = await buildMyMenu(me);
  revalidatePath("/", "layout");
  return r;
}

/** From the dish page: put a dish on, or take it off, my own menu for one meal. */
export async function setMine(formData: FormData) {
  const me = await currentPerson();
  const id = Number(formData.get("id"));
  const meal = String(formData.get("meal")) as Meal;
  if (!me?.ownMenu || !Number.isFinite(id) || !MEALS.includes(meal)) return;
  await setMyMenuMeal(me.id, id, meal, formData.get("on") === "1");
  revalidatePath("/", "layout");
}

export type MyPickResult = { ok: true; ids: number[] } | { ok: false; reason: "full" | "not-mine" | "denied" };

/** Add a dish to, or remove it from, my options for tomorrow's meal. */
export async function pickMine(meal: Meal, dishId: number): Promise<MyPickResult> {
  const me = await currentPerson();
  if (!me?.ownMenu || !MEALS.includes(meal) || !Number.isFinite(dishId)) return { ok: false, reason: "denied" };
  const r = await toggleMyPick(tomorrowKey(), me.id, meal, dishId);
  if (r === "full" || r === "not-mine") return { ok: false, reason: r };
  revalidatePath("/tomorrow");
  revalidatePath("/today");
  return { ok: true, ids: r };
}
