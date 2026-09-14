import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, type Dish, type Lang, type Meal, type Person } from "@/db/schema";

export async function listDishes(meal?: Meal): Promise<Dish[]> {
  await ensureSchema();
  const where = meal ? eq(dishes.meal, meal) : undefined;
  return db.select().from(dishes).where(where).orderBy(asc(dishes.nameEn));
}

export async function getDish(slug: string): Promise<Dish | null> {
  await ensureSchema();
  const [d] = await db.select().from(dishes).where(eq(dishes.slug, slug));
  return d ?? null;
}

export async function listReadyDishes(meal: Meal): Promise<Dish[]> {
  await ensureSchema();
  return db.select().from(dishes).where(and(eq(dishes.meal, meal), eq(dishes.status, "ready"))).orderBy(asc(dishes.nameEn));
}

/** True when the dish carries a tag this person does not eat. */
export function dislikedBy(dish: Dish, person: Pick<Person, "dislikes">): boolean {
  const bad = new Set(person.dislikes ?? []);
  return (dish.tags ?? []).some((tag) => bad.has(tag));
}

export function splitByDislikes<T extends Dish>(list: T[], person: Pick<Person, "dislikes">) {
  const shown: T[] = [];
  let hidden = 0;
  for (const d of list) {
    if (dislikedBy(d, person)) hidden++;
    else shown.push(d);
  }
  return { shown, hidden };
}

export function dishName(d: Dish, lang: Lang): string {
  return lang === "ar" ? d.nameAr : lang === "fr" ? d.nameFr : d.nameEn;
}

export function dishDesc(d: Dish, lang: Lang): string {
  return lang === "fr" ? d.descFr : lang === "ar" ? "" : d.descEn;
}

export function ingredientName(i: { en: string; fr: string; ar: string }, lang: Lang): string {
  return lang === "ar" ? i.ar : lang === "fr" ? i.fr : i.en;
}

export function formatQty(qty: number, unit: string, lang: Lang): string {
  const n = Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 10) / 10);
  const units: Record<string, Record<Lang, string>> = {
    g: { en: "g", fr: "g", ar: "غ" },
    ml: { en: "ml", fr: "ml", ar: "مل" },
    piece: { en: "", fr: "", ar: "" },
    bunch: { en: "bunch", fr: "botte", ar: "ربطة" },
    tbsp: { en: "tbsp", fr: "c. à s.", ar: "م.ك" },
    tsp: { en: "tsp", fr: "c. à c.", ar: "م.ص" },
    pinch: { en: "pinch", fr: "pincée", ar: "رشة" },
  };
  const u = units[unit]?.[lang] ?? unit;
  return u ? `${n} ${u}` : n;
}
