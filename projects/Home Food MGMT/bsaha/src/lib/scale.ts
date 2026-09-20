import type { Lang } from "@/db/schema";

export function ingredientName(i: { en: string; fr: string; ar: string }, lang: Lang): string {
  return lang === "ar" ? i.ar : lang === "fr" ? i.fr : i.en;
}

export function formatQty(qty: number, unit: string, lang: Lang): string {
  const n = formatNumber(qty);
  const units: Record<string, Record<Lang, string>> = {
    g: { en: "g", fr: "g", ar: "غ" },
    ml: { en: "ml", fr: "ml", ar: "مل" },
    piece: { en: "", fr: "", ar: "" },
    bunch: { en: "bunch", fr: "botte", ar: "ربطة" },
    tbsp: { en: "tbsp", fr: "c. à s.", ar: "م.ك" },
    tsp: { en: "tsp", fr: "c. à c.", ar: "م.ص" },
    pinch: { en: "pinch", fr: "pincée", ar: "رشة" },
  };
  const u = units[unit]?.[lang] ?? unit;
  return u ? `${n} ${u}` : n;
}

/**
 * Ingredient quantities are stored for `servings` people. The cook picks how many she is
 * cooking for and every line is scaled, then rounded to something she can actually measure:
 * grams and millilitres to a round number, pieces to halves, spoons to quarters.
 */
export function scaleQty(qty: number, unit: string, from: number, to: number): number {
  if (from <= 0 || to <= 0 || from === to) return qty;
  const raw = (qty * to) / from;
  switch (unit) {
    case "g":
    case "ml":
      if (raw < 10) return Math.max(1, Math.round(raw));
      if (raw < 100) return Math.round(raw / 5) * 5;
      return Math.round(raw / 10) * 10;
    case "tbsp":
    case "tsp":
      return Math.max(0.25, Math.round(raw * 4) / 4);
    case "pinch":
      return Math.max(1, Math.round(raw));
    default: // piece, bunch
      return Math.max(0.5, Math.round(raw * 2) / 2);
  }
}

/** Quarters as fractions, everything else to one decimal at most. */
export function formatNumber(n: number): string {
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 4) / 4;
  const glyph = { 0.25: "¼", 0.5: "½", 0.75: "¾" }[frac as 0.25 | 0.5 | 0.75];
  if (glyph !== undefined && Math.abs(n - whole - frac) < 1e-9) return whole ? `${whole}${glyph}` : glyph;
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

/** The counts the cook can tap. Always includes what the recipe was written for. */
export function peopleOptions(base: number): number[] {
  const set = new Set([1, 2, 4, 6, 8, base]);
  return [...set].filter((n) => n > 0).sort((a, b) => a - b);
}
