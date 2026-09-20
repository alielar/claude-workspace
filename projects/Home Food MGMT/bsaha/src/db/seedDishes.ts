/**
 * Loads the library (data/dishes/*.json + data/photos.json) into the dishes table:
 * the NHS-sourced international catalog, the Moroccan catalog (Moroccan menu only), and the
 * high-protein set adapted from the USDA MyPlate Kitchen recipes (public domain).
 * Upserts by slug so re-running after a content fix updates text but keeps custom dishes,
 * the reviewed flag, any photo the cook replaced, `on_menu` and a "deleted" status (a dish deleted
 * for good in the app keeps its row as a tombstone, so this upsert cannot revive it). Anything built-in (not custom) whose
 * slug is no longer in the source files below is removed - the catalog is exactly these
 * files, nothing left over from an earlier library. The old hand-written library lives in
 * data/dishes-archive/ if it's ever needed again.
 */
import { eq, sql, and, notInArray, inArray } from "drizzle-orm";
import { db } from "./index";
import { dishes, pools, type Ingredient, type Macros, type Recipe } from "./schema";
import { slugify } from "@/lib/slug";
import nhsBreakfast from "../../data/dishes/nhs-breakfast.json";
import nhsLunch from "../../data/dishes/nhs-lunch.json";
import nhsDinner from "../../data/dishes/nhs-dinner.json";
import morBreakfast from "../../data/dishes/moroccan-breakfast.json";
import morLunch from "../../data/dishes/moroccan-lunch.json";
import morDinner from "../../data/dishes/moroccan-dinner.json";
import mpBreakfast from "../../data/dishes/myplate-breakfast.json";
import mpLunch from "../../data/dishes/myplate-lunch.json";
import mpDinner from "../../data/dishes/myplate-dinner.json";
import lib1 from "../../data/dishes/myplate-library-1.json";
import lib2 from "../../data/dishes/myplate-library-2.json";
import lib3 from "../../data/dishes/myplate-library-3.json";
import lib4 from "../../data/dishes/myplate-library-4.json";
import lib5 from "../../data/dishes/myplate-library-5.json";
import lib6 from "../../data/dishes/myplate-library-6.json";
import lib7 from "../../data/dishes/myplate-library-7.json";
import photos from "../../data/photos.json";
import lean from "../../data/lean-moroccan.json";
import videos from "../../data/videos/all.json";

type Raw = {
  /** Slug of the original source recipe. Photos stay linked to it when a name is edited. */
  slug?: string;
  /** false for a bulk import that lands in the library only, for someone to put on the menu. */
  on_menu?: boolean;
  meal: "breakfast" | "lunch" | "dinner";
  name_en: string; name_fr: string; name_ar: string; name_latin: string;
  desc_en?: string; desc_fr?: string; cuisine?: string;
  servings?: number; prep_min?: number; cook_min?: number;
  macros: Macros; ingredients: Ingredient[]; recipe_ar: Recipe; tags: string[];
};
type Photo = { file: string; credit: string; license: string; source: string };

const ALL = [
  ...(nhsBreakfast as Raw[]), ...(nhsLunch as Raw[]), ...(nhsDinner as Raw[]),
  ...(morBreakfast as Raw[]), ...(morLunch as Raw[]), ...(morDinner as Raw[]),
  ...(mpBreakfast as Raw[]), ...(mpLunch as Raw[]), ...(mpDinner as Raw[]),
  // Library only: high-protein MyPlate recipes waiting to be put on the menu.
  ...(lib1 as Raw[]), ...(lib2 as Raw[]), ...(lib3 as Raw[]), ...(lib4 as Raw[]), ...(lib5 as Raw[]), ...(lib6 as Raw[]), ...(lib7 as Raw[]),
];
const PHOTOS = photos as Record<string, Photo>;
const LEAN = new Set(Object.values(lean as Record<string, string[] | string>).flat().filter((v) => typeof v === "string").map((n) => slugify(n)));
const inMain = (r: Raw) => r.cuisine !== "Moroccan";
const isLean = (r: Raw, slug: string) => r.cuisine !== "Moroccan" || LEAN.has(slug);
const VIDEOS = videos as Record<string, { url: string }>;

export async function seedDishes() {
  const now = new Date().toISOString();
  for (const r of ALL) {
    const slug = slugify(r.name_en);
    const photo = PHOTOS[slug] ?? (r.slug ? PHOTOS[r.slug] : undefined);
    const row = {
      slug,
      meal: r.meal,
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
      tags: r.tags ?? [],
      inMain: inMain(r),
      isLean: isLean(r, slug),
      ...(VIDEOS[r.name_en]?.url ? { videoUrl: VIDEOS[r.name_en].url } : {}),
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
          meal: row.meal, nameEn: row.nameEn, nameFr: row.nameFr, nameAr: row.nameAr, nameLatin: row.nameLatin,
          descEn: row.descEn, descFr: row.descFr, cuisine: row.cuisine, servings: row.servings,
          prepMin: row.prepMin, cookMin: row.cookMin, macros: row.macros, ingredients: row.ingredients,
          recipeAr: row.recipeAr, tags: row.tags, inMain: row.inMain, isLean: row.isLean,
          // a video set by hand in the app wins over the seed list
          ...(row.videoUrl ? { videoUrl: sql`COALESCE(video_url, ${row.videoUrl})` } : {}),
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

  // The catalog is exactly the source files above: drop any built-in dish no longer listed.
  const currentSlugs = ALL.map((r) => slugify(r.name_en));
  const stale = currentSlugs.length
    ? await db.select({ id: dishes.id }).from(dishes).where(and(eq(dishes.isCustom, false), notInArray(dishes.slug, currentSlugs)))
    : await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.isCustom, false));
  if (stale.length) {
    const staleIds = stale.map((d) => d.id);
    await db.delete(pools).where(inArray(pools.dishId, staleIds));
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
