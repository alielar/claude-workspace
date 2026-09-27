/**
 * The grocery list's shape and its text helper, kept apart from grocery.ts so a client
 * component can import them without dragging the database into the browser bundle.
 */
import type { Lang } from "@/db/schema";

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

export function lineName(l: GroceryLine, lang: Lang): string {
  return lang === "ar" ? l.ar : lang === "fr" ? l.fr : l.en;
}
