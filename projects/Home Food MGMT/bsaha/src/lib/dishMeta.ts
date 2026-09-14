/** Shared, dependency-free helpers for the client browser and the server. */
import type { Lang, Meal } from "@/db/schema";

/** Slim dish shape sent to the phone once, so switching meals and filtering never touch the server. */
export type SlimDish = {
  id: number;
  slug: string;
  meal: Meal;
  nameEn: string;
  nameFr: string;
  nameAr: string;
  nameLatin: string;
  cuisine: string;
  inMain: boolean;
  lean: boolean;
  tags: string[];
  kcal: number;
  protein: number;
  fiber: number;
  minutes: number;
  photo: string | null;
  ingredientsText: string;
};

export type Lightness = "light" | "balanced" | "hearty";

const LIGHT: Record<Meal, [number, number]> = { breakfast: [350, 480], lunch: [480, 620], dinner: [330, 450] };
const PROTEIN: Record<Meal, number> = { breakfast: 20, lunch: 35, dinner: 25 };

export function lightness(meal: Meal, kcal: number): Lightness {
  const [lo, hi] = LIGHT[meal];
  return kcal <= lo ? "light" : kcal >= hi ? "hearty" : "balanced";
}
export const highProtein = (d: SlimDish) => d.protein >= PROTEIN[d.meal];
export const highFibre = (d: SlimDish) => d.fiber >= 10;
export const quick = (d: SlimDish) => d.minutes > 0 && d.minutes <= 30;

export function slimName(d: SlimDish, lang: Lang) {
  return lang === "ar" ? d.nameAr : lang === "fr" ? d.nameFr : d.nameEn;
}

export const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ً-ْ]/g, "");

/** Thumbnail for a stock photo, the original for anything else. */
export const thumb = (url: string | null) => (url && url.startsWith("/dishes/") ? url.replace("/dishes/", "/dishes/thumb/") : url);
