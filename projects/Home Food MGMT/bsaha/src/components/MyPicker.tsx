"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import type { Lang, Meal } from "@/db/schema";
import { slimName, type SlimDish } from "@/lib/dishMeta";
import { DishImage } from "./DishImage";
import { pickMine } from "@/app/(app)/mine/actions";

export type MyPickerLabels = { breakfast: string; lunch: string; dinner: string; nothingForMeal: string; optionsFull: string; chosen: string };

/**
 * One block per meal: my own menu as photo tiles, tap up to `max` of them as tomorrow's options.
 * Tap a chosen one again to drop it. No deadline: the cook reads the options when she cooks.
 */
export function MyPicker({ items, initial, lang, labels, max, meals }: {
  items: { meal: Meal; dish: SlimDish }[];
  initial: Record<Meal, number[]>;
  lang: Lang;
  labels: MyPickerLabels;
  max: number;
  meals: Meal[];
}) {
  const [picked, setPicked] = useState<Record<Meal, number[]>>(initial);
  const [full, setFull] = useState<Meal | null>(null);
  const [, start] = useTransition();

  const tap = (meal: Meal, id: number) => {
    const before = picked[meal];
    const on = before.includes(id);
    if (!on && before.length >= max) { setFull(meal); setTimeout(() => setFull(null), 1500); return; }
    setPicked((p) => ({ ...p, [meal]: on ? before.filter((x) => x !== id) : [...before, id] }));
    start(async () => {
      const r = await pickMine(meal, id);
      setPicked((p) => ({ ...p, [meal]: r.ok ? r.ids : before }));
    });
  };

  return (
    <div className="grid gap-8">
      {meals.map((meal) => {
        const list = items.filter((i) => i.meal === meal);
        const mine = picked[meal];
        return (
          <section key={meal}>
            <div className="sticky top-0 z-10 -mx-5 px-5 py-2 bg-bg/95 backdrop-blur flex items-baseline justify-between gap-3 lg:-mx-10 lg:px-10">
              <h2 className="text-xl font-extrabold">{labels[meal]}</h2>
              <span className={clsx("text-sm font-bold", full === meal ? "text-accent" : mine.length === max ? "text-accent" : "text-muted")}>
                {full === meal ? labels.optionsFull : `${mine.length} / ${max}`}
              </span>
            </div>
            {list.length === 0 ? (
              <p className="mt-2 text-muted">{labels.nothingForMeal}</p>
            ) : (
              <div className="mt-2 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {list.map(({ dish }) => {
                  const on = mine.includes(dish.id);
                  return (
                    <button key={dish.id} onClick={() => tap(meal, dish.id)} aria-pressed={on}
                      className={clsx("tile overflow-hidden text-start flex flex-col", on && "border-accent ring-2 ring-accent")}>
                      <span className="aspect-[4/3] w-full bg-accent-soft relative block">
                        <DishImage photo={dish.photo} />
                        {on && <span className="chip bg-accent text-accent-ink py-1 px-2.5 text-xs absolute top-2 end-2">{labels.chosen}</span>}
                      </span>
                      <span className="p-3 block">
                        <span className="block text-sm font-bold leading-tight">{slimName(dish, lang)}</span>
                        <span className="block text-xs text-muted mt-0.5">{dish.protein} g · {dish.kcal} kcal</span>
                      </span>
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
