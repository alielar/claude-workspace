/**
 * Custom dish job: from a name (and optional photo) Claude fills ingredients, method, macros and the
 * Darija recipe. Runs after the response is sent (next/server `after`). Needs ANTHROPIC_API_KEY.
 */
import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { dishes, type Ingredient, type Macros, type Recipe } from "@/db/schema";
import { DISH_RULES } from "./dishRules";

const MODEL = process.env.DISH_MODEL || "claude-sonnet-5";

type Filled = {
  name_en: string; name_fr: string; name_ar: string; name_latin: string;
  desc_en: string; desc_fr: string; cuisine: string; servings: number; prep_min: number; cook_min: number;
  macros: Macros; ingredients: Ingredient[]; recipe_ar: Recipe; tags: string[];
};

export async function researchDish(id: number, name: string, meal: string) {
  if (!process.env.ANTHROPIC_API_KEY) {
    await db.update(dishes).set({ status: "failed" }).where(eq(dishes.id, id));
    return;
  }
  try {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: DISH_RULES,
      messages: [{ role: "user", content: `Meal type: ${meal}. Dish (as typed by a family member, may be in English, French or Darija): "${name}". Keep name_en close to what they typed if it is English.` }],
    });
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const f = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as Filled;
    await db
      .update(dishes)
      .set({
        nameEn: f.name_en || name, nameFr: f.name_fr || name, nameAr: f.name_ar || name, nameLatin: f.name_latin || name,
        descEn: f.desc_en ?? "", descFr: f.desc_fr ?? "", cuisine: f.cuisine ?? "",
        servings: f.servings || 4, prepMin: f.prep_min || 0, cookMin: f.cook_min || 0,
        macros: f.macros, ingredients: f.ingredients, recipeAr: f.recipe_ar, tags: f.tags ?? [],
        status: "ready",
      })
      .where(eq(dishes.id, id));
  } catch (e) {
    console.error("researchDish failed", e);
    await db.update(dishes).set({ status: "failed" }).where(eq(dishes.id, id));
  }
}
