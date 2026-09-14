import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, type Dish } from "@/db/schema";
import type { SlimDish } from "./dishMeta";

export function toSlim(d: Dish): SlimDish {
  return {
    id: d.id, slug: d.slug, meal: d.meal,
    nameEn: d.nameEn, nameFr: d.nameFr, nameAr: d.nameAr, nameLatin: d.nameLatin,
    cuisine: d.cuisine, inMain: d.inMain, lean: d.isLean, tags: d.tags ?? [],
    kcal: Math.round(d.macros?.kcal ?? 0), protein: Math.round(d.macros?.protein_g ?? 0), fiber: Math.round(d.macros?.fiber_g ?? 0),
    minutes: (d.prepMin ?? 0) + (d.cookMin ?? 0), photo: d.photoUrl,
    ingredientsText: (d.ingredients ?? []).map((i) => `${i.en} ${i.fr} ${i.ar}`).join(" "),
  };
}

/**
 * The grid needs about a tenth of each row (no recipe, no description). Selected narrowly and kept
 * in memory for 30 s per server instance, so a tab switch costs one small query at most.
 */
let memo: { at: number; data: SlimDish[] } | null = null;
const TTL = 30_000;

export async function listSlimDishes(): Promise<SlimDish[]> {
  if (memo && Date.now() - memo.at < TTL) return memo.data;
  await ensureSchema();
  const rows = await db
    .select({
      id: dishes.id, slug: dishes.slug, meal: dishes.meal,
      nameEn: dishes.nameEn, nameFr: dishes.nameFr, nameAr: dishes.nameAr, nameLatin: dishes.nameLatin,
      cuisine: dishes.cuisine, inMain: dishes.inMain, isLean: dishes.isLean, tags: dishes.tags, macros: dishes.macros,
      prepMin: dishes.prepMin, cookMin: dishes.cookMin, photoUrl: dishes.photoUrl, ingredients: dishes.ingredients,
    })
    .from(dishes)
    .where(eq(dishes.status, "ready"))
    .orderBy(asc(dishes.nameEn));
  const data = rows.map((d) => toSlim(d as Dish));
  memo = { at: Date.now(), data };
  return data;
}

export function forgetSlimDishes() {
  memo = null;
}
