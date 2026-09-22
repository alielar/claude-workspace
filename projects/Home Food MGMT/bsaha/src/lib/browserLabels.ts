import type { Lang } from "@/db/schema";
import { t, type Key } from "./i18n/dict";

const KEYS = [
  "breakfast", "lunch", "dinner", "mainMenu", "moroccanMenu", "search", "searchHint", "results", "noResults", "clear",
  "f_light", "f_balanced", "f_hearty", "f_protein", "f_lowcarb", "f_fibre", "f_quick", "f_veg", "f_fish", "f_chicken", "f_meat",
  "hiddenByDislikes", "inPool", "healthy", "rich", "allCategories", "allGroups",
  "c_main", "c_side", "c_salad", "c_soup", "c_sandwich", "c_appetizer", "c_sauce", "c_dessert", "c_breakfast", "c_bread", "c_snack", "c_beverage",
  "g_vegetables", "g_fruits", "g_grains", "g_protein", "g_dairy",
] as const satisfies readonly Key[];

export function browserLabels(lang: Lang) {
  return Object.fromEntries(KEYS.map((k) => [k, t(lang, k)])) as Record<(typeof KEYS)[number], string>;
}
