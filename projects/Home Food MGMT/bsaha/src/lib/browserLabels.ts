import type { Lang } from "@/db/schema";
import { t, type Key } from "./i18n/dict";

const KEYS = [
  "breakfast", "lunch", "dinner", "mainMenu", "moroccanMenu", "search", "searchHint", "results", "noResults", "clear",
  "f_light", "f_balanced", "f_hearty", "f_protein", "f_fibre", "f_quick", "f_veg", "f_fish", "f_chicken", "f_meat",
  "hiddenByDislikes", "inPool",
] as const satisfies readonly Key[];

export function browserLabels(lang: Lang) {
  return Object.fromEntries(KEYS.map((k) => [k, t(lang, k)])) as Record<(typeof KEYS)[number], string>;
}
