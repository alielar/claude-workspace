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

/** Rows go to the database in batches of this many; one round trip per batch keeps the import inside a serverless timeout. */
const BATCH = 40;

export async function seedDishes() {
  const now = new Date().toISOString();
  const rows = ALL.map((r) => {
    const slug = r.slug ?? slugify(r.name_en);
    const categories = r.categories ?? [];
    const meals = r.meal ? [r.meal] : mealsFor(categories);
    const meal: Meal = r.meal ?? (meals.includes("lunch") ? "lunch" : meals[0]);
    const photo = r.photo ?? undefined;
    return {
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
      photoUrl: photo ? `/dishes/${photo.file}` : null,
      photoCredit: photo?.credit ?? null,
      photoLicense: photo?.license ?? null,
      photoSourceUrl: photo?.source ?? null,
    };
  });

  // `excluded.<col>` is the value this batch tried to insert, so one statement serves every row.
  const ex = (col: string) => sql.raw(`excluded.${col}`);
  for (let i = 0; i < rows.length; i += BATCH) {
    await db
      .insert(dishes)
      .values(rows.slice(i, i + BATCH))
      .onConflictDoUpdate({
        target: dishes.slug,
        set: {
          meal: ex("meal"), meals: ex("meals"), categories: ex("categories"), foodGroups: ex("food_groups"), nutrition: ex("nutrition"),
          nameEn: ex("name_en"), nameFr: ex("name_fr"), nameAr: ex("name_ar"), nameLatin: ex("name_latin"),
          descEn: ex("desc_en"), descFr: ex("desc_fr"), cuisine: ex("cuisine"), servings: ex("servings"),
          prepMin: ex("prep_min"), cookMin: ex("cook_min"), macros: ex("macros"), ingredients: ex("ingredients"),
          recipeEn: ex("recipe_en"), recipeFr: ex("recipe_fr"), tags: ex("tags"), inMain: ex("in_main"), isLean: ex("is_lean"),
          rating: ex("rating"), ratingCount: ex("rating_count"), sourceUrl: ex("source_url"), sourceText: ex("source_text"),
          // a Darija recipe edited and reviewed in the app wins over the import
          recipeAr: sql`CASE WHEN dishes.reviewed = 1 THEN dishes.recipe_ar ELSE excluded.recipe_ar END`,
          // the import decides the stock photo (a withdrawn photo is withdrawn here too); a photo the cook took herself stays
          photoUrl: sql`CASE WHEN dishes.photo_url IS NOT NULL AND dishes.photo_url NOT LIKE '/dishes/%' THEN dishes.photo_url ELSE excluded.photo_url END`,
          photoCredit: sql`CASE WHEN dishes.photo_url IS NOT NULL AND dishes.photo_url NOT LIKE '/dishes/%' THEN dishes.photo_credit ELSE excluded.photo_credit END`,
          photoLicense: sql`CASE WHEN dishes.photo_url IS NOT NULL AND dishes.photo_url NOT LIKE '/dishes/%' THEN dishes.photo_license ELSE excluded.photo_license END`,
          photoSourceUrl: sql`CASE WHEN dishes.photo_url IS NOT NULL AND dishes.photo_url NOT LIKE '/dishes/%' THEN dishes.photo_source_url ELSE excluded.photo_source_url END`,
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
