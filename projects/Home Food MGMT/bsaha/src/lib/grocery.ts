/**
 * The weekly grocery list, built from the plan. For each day and meal only one of the two
 * options gets cooked, so an ingredient that both options need is bought once (the larger
 * amount), and one that only one option needs is bought for that option. Dry goods and fresh
 * goods are listed apart. Breakfast is not planned, so its section is the ingredients that
 * appear most often across the breakfast dishes on the menu, scaled to a week.
 */
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensureSchema } from "@/db/migrate";
import { dishes, type Dish, type Ingredient, type Lang } from "@/db/schema";
import { scaleQty } from "./scale";
import { inMeal } from "./dishMeta";
import { toSlim } from "./slim";
import { getWeekPlan, headcount, ingredientKey, PLAN_MEALS } from "./week";

export type GroceryLine = {
  key: string;
  /** Names in the three languages, from the most common spelling among the dishes. */
  en: string; fr: string; ar: string;
  unit: string;
  qty: number;
  group: "fresh" | "dry";
  /** Which dishes need it (English names), for the reader who wonders why. */
  dishes: string[];
};

export type GroceryList = { people: number; days: string[]; fresh: GroceryLine[]; dry: GroceryLine[]; breakfast: GroceryLine[] };

type Acc = Map<string, GroceryLine>;

function add(acc: Acc, i: Ingredient, qty: number, dish: string) {
  const key = `${ingredientKey(i.en)}|${i.unit}`;
  const line = acc.get(key);
  if (line) {
    line.qty += qty;
    if (!line.dishes.includes(dish)) line.dishes.push(dish);
  } else {
    acc.set(key, { key, en: i.en.split(",")[0], fr: i.fr.split(",")[0], ar: i.ar.split("،")[0].split(",")[0], unit: i.unit, qty, group: i.group, dishes: [dish] });
  }
}

/** Round to what a shopper can actually buy. */
function tidy(line: GroceryLine): GroceryLine {
  const q = line.qty;
  let r: number;
  switch (line.unit) {
    case "g": case "ml": r = q < 100 ? Math.ceil(q / 10) * 10 : q < 1000 ? Math.ceil(q / 50) * 50 : Math.ceil(q / 100) * 100; break;
    case "tbsp": case "tsp": case "pinch": r = Math.ceil(q); break;
    default: r = Math.ceil(q * 2) / 2;
  }
  return { ...line, qty: r };
}

const PROTEIN_WORDS = /egg|milk|yogurt|yoghurt|cheese|jben|chicken|turkey|tuna|sardine|bean|lentil|chickpea|peanut|almond|nut|oat|butter/;

export async function buildGroceryList(days: string[]): Promise<GroceryList> {
  await ensureSchema();
  const [plan, people] = await Promise.all([getWeekPlan(days), headcount()]);
  const acc: Acc = new Map();

  for (const day of days) {
    for (const meal of PLAN_MEALS) {
      const options = plan.filter((s) => s.day === day && s.meal === meal).map((s) => s.dish);
      if (options.length === 0) continue;
      // per ingredient, the most any one option needs for the household
      const need = new Map<string, { i: Ingredient; qty: number; dish: string }>();
      for (const d of options) {
        for (const i of d.ingredients ?? []) {
          const qty = scaleQty(i.qty, i.unit, d.servings || 4, people);
          const k = `${ingredientKey(i.en)}|${i.unit}`;
          const cur = need.get(k);
          if (!cur || qty > cur.qty) need.set(k, { i, qty, dish: d.nameEn });
        }
      }
      for (const { i, qty, dish } of need.values()) add(acc, i, qty, dish);
    }
  }

  const lines = [...acc.values()].map(tidy).sort((a, b) => a.en.localeCompare(b.en));
  const fresh = lines.filter((l) => l.group === "fresh");
  const dry = lines.filter((l) => l.group === "dry");

  // Breakfast: the staples behind the breakfast dishes on the menu.
  const bf = (await db.select().from(dishes).where(and(eq(dishes.status, "ready"), eq(dishes.onMenu, true))))
    .filter((d: Dish) => inMeal(toSlim(d), "breakfast"));
  const breakfast: GroceryLine[] = [];
  if (bf.length > 0) {
    const stat = new Map<string, { line: GroceryLine; dishesUsing: number; perServing: number }>();
    for (const d of bf) {
      const seen = new Set<string>();
      for (const i of d.ingredients ?? []) {
        const k = `${ingredientKey(i.en)}|${i.unit}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const per = i.qty / (d.servings || 4);
        const cur = stat.get(k);
        if (cur) { cur.dishesUsing++; cur.perServing += per; cur.line.dishes.push(d.nameEn); }
        else stat.set(k, { line: { key: k, en: i.en.split(",")[0], fr: i.fr.split(",")[0], ar: i.ar.split("،")[0], unit: i.unit, qty: 0, group: i.group, dishes: [d.nameEn] }, dishesUsing: 1, perServing: per });
      }
    }
    const ranked = [...stat.values()]
      .map((s) => ({ ...s, share: s.dishesUsing / bf.length, weight: (s.dishesUsing / bf.length) * (PROTEIN_WORDS.test(s.line.en.toLowerCase()) ? 1.6 : 1) }))
      .filter((s) => s.weight >= 0.12 && !/salt|water|pepper/.test(s.line.en.toLowerCase()))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 14);
    for (const s of ranked) {
      // a week of breakfasts for the household, in proportion to how often this staple appears
      const avgPer = s.perServing / s.dishesUsing;
      breakfast.push(tidy({ ...s.line, qty: avgPer * people * 7 * Math.min(1, s.share * 2) }));
    }
  }

  return { people, days, fresh, dry, breakfast };
}

export function lineName(l: GroceryLine, lang: Lang): string {
  return lang === "ar" ? l.ar : lang === "fr" ? l.fr : l.en;
}
