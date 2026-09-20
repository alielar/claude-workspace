"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import type { Lang, Meal } from "@/db/schema";
import { slimName, thumb, type SlimDish } from "@/lib/dishMeta";
import { choose } from "@/app/(app)/tomorrow/actions";

export type ChooserLabels = {
  breakfast: string; lunch: string; dinner: string;
  chosen: string; nothingForMeal: string; lockedNow: string; tapToChange: string; tapToChoose: string;
};

/**
 * One meal per block, the cook's shortlist as big photo tiles, tap one to choose it.
 * Tapping the chosen one again clears it. Locked after the evening deadline.
 */
export function MealChooser({
  pool, initial, lang, labels, locked, meals, child,
}: {
  pool: { meal: Meal; dish: SlimDish }[];
  initial: Partial<Record<Meal, number>>;
  lang: Lang;
  labels: ChooserLabels;
  locked: boolean;
  meals: Meal[];
  child?: boolean;
}) {
  const [picked, setPicked] = useState<Partial<Record<Meal, number>>>(initial);
  const [, start] = useTransition();

  const tap = (meal: Meal, id: number) => {
    if (locked) return;
    const before = picked[meal];
    setPicked((p) => ({ ...p, [meal]: before === id ? undefined : id }));
    start(async () => {
      const r = await choose(meal, id);
      if (!r.ok) setPicked((p) => ({ ...p, [meal]: before })); // server said no, put it back
    });
  };

  return (
    <div className="grid gap-8">
      {meals.map((meal) => {
        const items = pool.filter((p) => p.meal === meal);
        const mine = picked[meal];
        return (
          <section key={meal}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-extrabold">{labels[meal as "breakfast" | "lunch" | "dinner"]}</h2>
              {items.length > 0 && (
                <span className="text-sm text-muted">
                  {locked ? labels.lockedNow : mine ? labels.tapToChange : labels.tapToChoose}
                </span>
              )}
            </div>

            {items.length === 0 ? (
              <p className="mt-2 text-muted">{labels.nothingForMeal}</p>
            ) : (
              <div className="mt-3 grid gap-3">
                {items.map(({ dish }) => {
                  const on = mine === dish.id;
                  const dim = locked && mine !== undefined && !on;
                  return (
                    <button
                      key={dish.id}
                      onClick={() => tap(meal, dish.id)}
                      disabled={locked}
                      aria-pressed={on}
                      className={clsx(
                        "tile overflow-hidden text-start flex items-center gap-3 p-2",
                        on && "border-accent ring-2 ring-accent",
                        dim && "opacity-40",
                        locked && "cursor-default",
                      )}
                    >
                      <span className="w-24 h-20 rounded-xl bg-accent-soft overflow-hidden shrink-0 relative">
                        {dish.photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb(dish.photo) ?? undefined} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-lg font-extrabold leading-tight">{slimName(dish, lang)}</span>
                        {lang !== "ar" && <span className="block text-sm text-muted">{dish.nameLatin}</span>}
                        {!child && <span className="block text-xs text-muted mt-0.5">{dish.kcal} kcal · {dish.protein} g</span>}
                      </span>
                      {on && <span className="chip bg-accent text-accent-ink py-1 px-2.5 text-xs ms-auto shrink-0">{labels.chosen}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
