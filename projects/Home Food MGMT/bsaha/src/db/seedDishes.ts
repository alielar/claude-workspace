/**
 * Loads the hand-written library (data/dishes/*.json + data/photos.json) into the dishes table.
 * Upserts by slug so re-running after a content fix updates text but keeps custom dishes,
 * the reviewed flag and any photo the cook replaced.
 */
import { sql } from "drizzle-orm";
import { db } from "./index";
import { dishes, type Ingredient, type Macros, type Recipe } from "./schema";
import { slugify } from "@/lib/slug";
import breakfast from "../../data/dishes/breakfast.json";
import lunch from "../../data/dishes/lunch.json";
import dinner from "../../data/dishes/dinner.json";
import intlBreakfast from "../../data/dishes/intl-breakfast.json";
import intlLunch from "../../data/dishes/intl-lunch.json";
import intlDinner from "../../data/dishes/intl-dinner.json";
import photos from "../../data/photos.json";
import lean from "../../data/lean-moroccan.json";
import videos from "../../data/videos/all.json";

type Raw = {
  meal: "breakfast" | "lunch" | "dinner";
  name_en: string; name_fr: string; name_ar: string; name_latin: string;
  desc_en?: string; desc_fr?: string; cuisine?: string;
  servings?: number; prep_min?: number; cook_min?: number;
  macros: Macros; ingredients: Ingredient[]; recipe_ar: Recipe; tags: string[];
};
type Photo = { file: string; credit: string; license: string; source: string };

const ALL = [...(breakfast as Raw[]), ...(lunch as Raw[]), ...(dinner as Raw[]), ...(intlBreakfast as Raw[]), ...(intlLunch as Raw[]), ...(intlDinner as Raw[])];
const PHOTOS = photos as Record<string, Photo>;
const LEAN = new Set(Object.values(lean as Record<string, string[] | string>).flat().filter((v) => typeof v === "string").map((n) => slugify(n)));
const inMain = (r: Raw) => r.cuisine !== "Moroccan";
const isLean = (r: Raw, slug: string) => r.cuisine !== "Moroccan" || LEAN.has(slug);
const VIDEOS = videos as Record<string, { url: string }>;

export async function seedDishes() {
  const now = new Date().toISOString();
  for (const r of ALL) {
    const slug = slugify(r.name_en);
    const photo = PHOTOS[slug];
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
  return ALL.length;
}
