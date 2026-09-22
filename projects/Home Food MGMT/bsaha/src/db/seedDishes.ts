/**
 * Loads the library into the dishes table. Since 2026-09-22 the library is the USDA MyPlate Kitchen
 * collection (data/dishes/myplate.json, built by scripts/myplate/, public domain recipes and photos).
 * The earlier in-house international and Moroccan sets are archived in data/dishes-archive/library-2026-09-22/.
 *
 * Upserts by slug so re-running after a content fix updates text but keeps custom dishes,
 * the reviewed flag, any photo the cook replaced, `on_menu` and a "deleted" status (a dish deleted
 * for good in the app keeps its row as a tombstone, so this upsert cannot revive it). Anything built-in
 * (not custom) whose slug is no longer in the source file is removed, together with its pool rows.
 */
import { eq, sql, and, notInArray, inArray } from "drizzle-orm";
import { db } from "./index";
import { dishes, pools, picks, type Category, type FoodGroupAmount, type Ingredient, type Macros, type Meal, type Nutrition, type Recipe } from "./schema";
import { slugify } from "@/lib/slug";
import myplate from "../../data/dishes/myplate.json";

type Photo = { file: string; credit: string; license: string; source: string };
type Raw = {
  slug?: string;
  on_menu?: boolean;
  /** Optional: the pipeline derives it from `categories` when missing. */
  meal?: Meal;
  name_en: string; name_fr: string; name_ar: string; name_latin: string;
  desc_en?: string; desc_fr?: string; cuisine?: string;
  servings?: number; prep_min?: number; cook_min?: number;
  macros: Macros; nutrition?: Nutrition; ingredients: Ingredient[];
  recipe_ar: Recipe; recipe_en?: Recipe; recipe_fr?: Recipe;
  tags: string[]; categories?: Category[]; food_groups?: FoodGroupAmount[];
  rating?: number | null; rating_count?: number;
  source_url?: string; source_text?: string;
  photo?: Photo | null;
};

const ALL = myplate as Raw[];

/**
 * Which meal tabs a dish appears under, from its USDA courses. Mains, soups, salads, sandwiches,
 * sides, appetizers and sauces belong to lunch and dinner; breakfast to breakfast; desserts, snacks,
 * breads and beverages to every meal.
 */
export function mealsFor(categories: Category[], fallback: Meal = "lunch"): Meal[] {
  const set = new Set<Meal>();
  for (const c of categories) {
    if (c === "breakfast") set.add("breakfast");
    else if (c === "dessert" || c === "snack" || c === "bread" || c === "beverage") { set.add("breakfast"); set.add("lunch"); set.add("dinner"); }
    else { set.add("lunch"); set.add("dinner"); }
  }
  if (set.size === 0) set.add(fallback);
  return (["breakfast", "lunch", "dinner"] as Meal[]).filter((m) => set.has(m));
}

export async function seedDishes() {
  const now = new Date().toISOString();
  for (const r of ALL) {
    const slug = r.slug ?? slugify(r.name_en);
    const categories = r.categories ?? [];
    const meals = r.meal ? [r.meal] : mealsFor(categories);
    const meal: Meal = r.meal ?? (meals.includes("lunch") ? "lunch" : meals[0]);
    const photo = r.photo ?? undefined;
    const row = {
      slug,
      meal,
      meals,
      categories,
      foodGroups: r.food_groups ?? [],
      nutrition: r.nutrition ?? {},
      nameEn: r.name_en,
      nameFr: r.name_fr,
      nameAr: r.name_ar,
      nameLatin: r.name_latin,
      descEn: r.desc_en ?? "",
      descFr: r.desc_fr ?? "",
      cuisine: r.cuisine ?? "",
      servings: r.servings ?? 4,
      prepMin: r.prep_min ?? 0,
      cookMin: r.cook_min ?? 0,
      macros: r.macros,
      ingredients: r.ingredients,
      recipeAr: r.recipe_ar,
      recipeEn: r.recipe_en ?? { steps: [], tips: [] },
      recipeFr: r.recipe_fr ?? { steps: [], tips: [] },
      tags: r.tags ?? [],
      rating: r.rating ?? null,
      ratingCount: r.rating_count ?? 0,
      sourceUrl: r.source_url ?? null,
      sourceText: r.source_text ?? null,
      inMain: r.cuisine !== "Moroccan",
      isLean: true,
      status: "ready",
      onMenu: r.on_menu ?? true,
      isCustom: false,
      createdAt: now,
      ...(photo
        ? { photoUrl: `/dishes/${photo.file}`, photoCredit: photo.credit, photoLicense: photo.license, photoSourceUrl: photo.source }
        : {}),
    };
    await db
      .insert(dishes)
      .values(row)
      .onConflictDoUpdate({
        target: dishes.slug,
        set: {
          meal: row.meal, meals: row.meals, categories: row.categories, foodGroups: row.foodGroups, nutrition: row.nutrition,
          nameEn: row.nameEn, nameFr: row.nameFr, nameAr: row.nameAr, nameLatin: row.nameLatin,
          descEn: row.descEn, descFr: row.descFr, cuisine: row.cuisine, servings: row.servings,
          prepMin: row.prepMin, cookMin: row.cookMin, macros: row.macros, ingredients: row.ingredients,
          recipeEn: row.recipeEn, recipeFr: row.recipeFr, tags: row.tags, inMain: row.inMain, isLean: row.isLean,
          rating: row.rating, ratingCount: row.ratingCount, sourceUrl: row.sourceUrl, sourceText: row.sourceText,
          // a Darija recipe edited and reviewed in the app wins over the import
          recipeAr: sql`CASE WHEN reviewed = 1 THEN recipe_ar ELSE ${JSON.stringify(row.recipeAr)} END`,
          // stock photo only fills a gap; a photo the cook took stays
          ...(photo
            ? {
                photoUrl: sql`CASE WHEN photo_url IS NULL OR photo_url LIKE '/dishes/%' THEN ${row.photoUrl} ELSE photo_url END`,
                photoCredit: sql`CASE WHEN photo_url IS NULL OR photo_url LIKE '/dishes/%' THEN ${row.photoCredit} ELSE photo_credit END`,
                photoLicense: sql`CASE WHEN photo_url IS NULL OR photo_url LIKE '/dishes/%' THEN ${row.photoLicense} ELSE photo_license END`,
                photoSourceUrl: sql`CASE WHEN photo_url IS NULL OR photo_url LIKE '/dishes/%' THEN ${row.photoSourceUrl} ELSE photo_source_url END`,
              }
            : {}),
        },
      });
  }

  // The catalog is exactly the source file: drop any built-in dish no longer listed, with its pool and pick rows.
  const currentSlugs = ALL.map((r) => r.slug ?? slugify(r.name_en));
  const stale = currentSlugs.length
    ? await db.select({ id: dishes.id }).from(dishes).where(and(eq(dishes.isCustom, false), notInArray(dishes.slug, currentSlugs)))
    : await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.isCustom, false));
  if (stale.length) {
    const staleIds = stale.map((d) => d.id);
    await db.delete(pools).where(inArray(pools.dishId, staleIds));
    await db.delete(picks).where(inArray(picks.dishId, staleIds));
    await db.delete(dishes).where(inArray(dishes.id, staleIds));
  }
  // Any pool row pointing at a dish that no longer exists at all (belt and braces).
  const liveIds = (await db.select({ id: dishes.id }).from(dishes)).map((d) => d.id);
  if (liveIds.length) {
    await db.delete(pools).where(notInArray(pools.dishId, liveIds));
  } else {
    await db.delete(pools);
  }

  return ALL.length;
}
