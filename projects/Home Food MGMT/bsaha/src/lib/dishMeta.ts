/** Shared, dependency-free helpers for the client browser and the server. */
import type { Category, FoodGroup, Lang, Meal } from "@/db/schema";

/** Slim dish shape sent to the phone once, so switching meals and filtering never touch the server. */
export type SlimDish = {
  id: number;
  slug: string;
  meal: Meal;
  /** Every meal tab this dish appears under. */
  meals: Meal[];
  categories: Category[];
  foodGroups: FoodGroup[];
  nameEn: string;
  nameFr: string;
  nameAr: string;
  nameLatin: string;
  cuisine: string;
  inMain: boolean;
  onMenu: boolean;
  lean: boolean;
  tags: string[];
  kcal: number;
  protein: number;
  carbs: number;
  fiber: number;
  minutes: number;
  rating: number | null;
  photo: string | null;
  ingredientsText: string;
};

export type Lightness = "light" | "balanced" | "hearty";

const LIGHT: Record<Meal, [number, number]> = { breakfast: [350, 480], lunch: [480, 620], dinner: [330, 450] };

export function lightness(meal: Meal, kcal: number): Lightness {
  const [lo, hi] = LIGHT[meal];
  return kcal <= lo ? "light" : kcal >= hi ? "hearty" : "balanced";
}
/** Same bars as the USDA MyPlate Kitchen filters: 20 g protein or more, 15 g carbs or less. */
export const highProtein = (d: SlimDish) => d.protein >= 20;
export const lowCarb = (d: SlimDish) => d.carbs <= 15;
export const highFibre = (d: SlimDish) => d.fiber >= 10;
export const quick = (d: SlimDish) => d.minutes > 0 && d.minutes <= 30;
/** True when the dish belongs under this meal tab. Old rows without `meals` fall back to `meal`. */
export const inMeal = (d: SlimDish, meal: Meal) => (d.meals.length ? d.meals.includes(meal) : d.meal === meal);

export function slimName(d: SlimDish, lang: Lang) {
  return lang === "ar" ? d.nameAr : lang === "fr" ? d.nameFr : d.nameEn;
}

export const fold = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ً-ْ]/g, "");

/** Thumbnail for a stock photo, the original for anything else. */
export const thumb = (url: string | null) => (url && url.startsWith("/dishes/") ? url.replace("/dishes/", "/dishes/thumb/") : url);
