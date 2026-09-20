"use client";

import { useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import type { Ingredient, Lang, Macros } from "@/db/schema";
import { formatQty, ingredientName, peopleOptions, scaleQty } from "@/lib/scale";

const KEY = "bsaha.people";

function readSaved(): number | null {
  try {
    const n = Number(localStorage.getItem(KEY));
    return n > 0 && n <= 20 ? n : null;
  } catch {
    return null;
  }
}

function subscribeStorage(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export type FactsLabels = {
  ingredients: string; howMany: string; forOne: string; forN: string;
  nutrition: string; estimates: string; perPerson: string; wholeDish: string;
  kcal: string; protein: string; carbs: string; fat: string; fiber: string;
};

const MACRO_KEYS = ["kcal", "protein_g", "carbs_g", "fat_g", "fiber_g"] as const;
const MACRO_LABEL: Record<(typeof MACRO_KEYS)[number], keyof FactsLabels> = {
  kcal: "kcal", protein_g: "protein", carbs_g: "carbs", fat_g: "fat", fiber_g: "fiber",
};

/**
 * Everything on a dish page that depends on how many people are eating: the people row,
 * the nutrition panel (per person, and the whole pot at that count) and the ingredient list.
 * Starts from `initial` (the number who ordered the dish, when known), else the count last
 * used on this device, else what the recipe was written for.
 */
export function Ingredients({
  items, macros, base, lang, initial, big, labels,
}: {
  items: Ingredient[];
  /** Per-serving estimates, or null when this person must not see them. */
  macros: Macros | null;
  base: number;
  lang: Lang;
  initial?: number;
  big?: boolean;
  labels: FactsLabels;
}) {
  // The count last used on this device. Read as an external store so the server render
  // (which cannot see it) and the first client render agree, then the saved value takes over.
  const saved = useSyncExternalStore(subscribeStorage, readSaved, () => null);
  const [picked, setPicked] = useState<number | null>(null);
  const people = picked ?? initial ?? saved ?? base;

  const choose = (n: number) => {
    setPicked(n);
    try { localStorage.setItem(KEY, String(n)); } catch { /* private mode or blocked storage: fine without */ }
  };

  const showMacros = macros !== null && macros.kcal > 0;
  if (items.length === 0 && !showMacros) return null;

  const heading = people === 1 ? labels.forOne : labels.forN.replace("{n}", String(people));

  const macroRow = (title: string, factor: number) => (
    <div className="mt-3">
      <div className="text-xs font-bold text-muted uppercase tracking-wide">{title}</div>
      <div className="mt-1.5 grid grid-cols-5 gap-2 text-center">
        {MACRO_KEYS.map((k) => (
          <div key={k}>
            <div className="text-lg font-extrabold">
              {Math.round((macros?.[k] ?? 0) * factor)}
              {k !== "kcal" && <span className="text-xs font-semibold text-muted">g</span>}
            </div>
            <div className="text-xs text-muted">{labels[MACRO_LABEL[k]]}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <>
      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-extrabold">{labels.howMany}</span>
          <span className="text-sm text-muted">{heading}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {peopleOptions(base).map((n) => (
            <button key={n} type="button" onClick={() => choose(n)}
              className={clsx("shrink-0 rounded-xl min-w-12 h-12 px-3 font-extrabold text-lg border",
                n === people ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line")}>
              {n}
            </button>
          ))}
        </div>
      </section>

      {showMacros && (
        <section className="mt-4 tile p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-extrabold">{labels.nutrition}</h2>
            <span className="text-xs text-muted">{labels.estimates}</span>
          </div>
          {macroRow(labels.perPerson, 1)}
          {people > 1 && macroRow(labels.wholeDish.replace("{n}", String(people)), people)}
        </section>
      )}

      {items.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xl font-extrabold">{labels.ingredients}</h2>
          <p className="text-sm text-muted">{heading}</p>
          <ul className="mt-3 tile divide-y divide-line">
            {items.map((i, k) => (
              <li key={k} className="flex justify-between gap-3 px-4 py-2.5">
                <span className={clsx(big && "text-lg")}>{ingredientName(i, lang)}</span>
                <span className={clsx("text-muted shrink-0 font-semibold", big && "text-lg")}>
                  {formatQty(scaleQty(i.qty, i.unit, base, people), i.unit, lang)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
