import type { Dish } from "@/db/schema";
import type { SlimDish } from "./dishMeta";

export function toSlim(d: Dish): SlimDish {
  return {
    id: d.id, slug: d.slug, meal: d.meal,
    nameEn: d.nameEn, nameFr: d.nameFr, nameAr: d.nameAr, nameLatin: d.nameLatin,
    cuisine: d.cuisine, inMain: d.inMain, tags: d.tags ?? [],
    kcal: Math.round(d.macros?.kcal ?? 0), protein: Math.round(d.macros?.protein_g ?? 0), fiber: Math.round(d.macros?.fiber_g ?? 0),
    minutes: (d.prepMin ?? 0) + (d.cookMin ?? 0), photo: d.photoUrl,
    ingredientsText: (d.ingredients ?? []).map((i) => `${i.en} ${i.fr} ${i.ar}`).join(" "),
  };
}
