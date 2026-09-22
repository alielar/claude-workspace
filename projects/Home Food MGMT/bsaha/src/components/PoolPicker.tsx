"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import type { Lang, Meal } from "@/db/schema";
import { slimName, type SlimDish } from "@/lib/dishMeta";
import { DishBrowser, type BrowserProps } from "./DishBrowser";
import { togglePool } from "@/app/(app)/pool/actions";

type Sel = { meal: Meal; id: number };

/**
 * Tomorrow's shortlist: up to `perMeal` dishes for each meal, chips on top and the browser below.
 * Taps update at once and the server catches up; a rejected tap is rolled back.
 */
export function PoolPicker({
  dishes, lang, labels, initial, perMeal, meals, poolLabels,
}: {
  dishes: SlimDish[]; lang: Lang; labels: BrowserProps["labels"]; initial: Sel[]; perMeal: number; meals: Meal[];
  poolLabels: { breakfast: string; lunch: string; dinner: string; poolCount: string; poolFull: string; remove: string };
}) {
  const [sel, setSel] = useState<Sel[]>(initial);
  const [full, setFull] = useState<Meal | null>(null);
  const [, start] = useTransition();
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const countFor = (meal: Meal) => sel.filter((s) => s.meal === meal).length;

  const toggle = (meal: Meal, id: number) => {
    const has = sel.some((s) => s.meal === meal && s.id === id);
    if (!has && countFor(meal) >= perMeal) { setFull(meal); return; }
    setFull(null);
    setSel((prev) => (has ? prev.filter((s) => !(s.meal === meal && s.id === id)) : [...prev, { meal, id }]));
    start(async () => {
      const n = await togglePool(meal, id);
      if (n === -1) { setFull(meal); setSel((prev) => prev.filter((s) => !(s.meal === meal && s.id === id))); }
    });
  };

  return (
    <div>
      {full && <p className="text-sm text-accent">{poolLabels.poolFull}</p>}

      {meals.map((meal) => {
        const items = sel.filter((s) => s.meal === meal);
        return (
          <section key={meal} className="mt-3">
            <h2 className={clsx("text-sm font-bold uppercase tracking-wide", items.length >= perMeal ? "text-accent" : "text-muted")}>
              {poolLabels[meal as keyof typeof poolLabels]} · {items.length} / {perMeal} {poolLabels.poolCount}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {items.map((s) => {
                const d = byId.get(s.id);
                return (
                  <button key={s.id} onClick={() => toggle(meal, s.id)} className="chip bg-accent text-accent-ink py-1.5 px-3 text-sm">
                    {d ? slimName(d, lang) : s.id} <span aria-label={poolLabels.remove}>×</span>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="mt-5">
        <DishBrowser
          dishes={dishes}
          lang={lang}
          labels={labels}
          dislikes={[]}
          initialMeal="lunch"
          pick={{ selected: sel.map((s) => s.id), onToggle: (d, meal) => toggle(meal, d.id), meals }}
        />
      </div>
    </div>
  );
}
