"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import type { Lang, Meal } from "@/db/schema";
import { slimName, type SlimDish } from "@/lib/dishMeta";
import { DishBrowser, type BrowserProps } from "./DishBrowser";
import { DishImage } from "./DishImage";
import { planAdd, planClear, planFill, planRemove } from "@/app/(app)/week/actions";

export type Slot = { day: string; meal: Meal; id: number };

export type WeekLabels = {
  lunch: string; dinner: string; fillWeek: string; clearWeek: string; clearWeekConfirm: string;
  addOption: string; remove: string; close: string; slotsFull: string; filled: string;
};

/**
 * Seven days, two options for lunch and two for dinner. Tap a slot to fill it from the menu,
 * tap a dish to take it out. "Fill the week" completes whatever is empty.
 */
export function WeekPlanner({
  dishes, lang, labels, browserLabels, days, dayLabels, initial, perMeal, meals,
}: {
  dishes: SlimDish[]; lang: Lang; labels: WeekLabels; browserLabels: BrowserProps["labels"];
  days: string[]; dayLabels: Record<string, string>; initial: Slot[]; perMeal: number; meals: Meal[];
}) {
  const [slots, setSlots] = useState<Slot[]>(initial);
  const [open, setOpen] = useState<{ day: string; meal: Meal } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const byId = useMemo(() => new Map(dishes.map((d) => [d.id, d])), [dishes]);
  const at = (day: string, meal: Meal) => slots.filter((s) => s.day === day && s.meal === meal);

  const add = (d: SlimDish) => {
    if (!open) return;
    const { day, meal } = open;
    if (at(day, meal).length >= perMeal || at(day, meal).some((s) => s.id === d.id)) return;
    setSlots((p) => [...p, { day, meal, id: d.id }]);
    setOpen(null);
    start(async () => {
      const ok = await planAdd(day, meal, d.id);
      if (!ok) { setSlots((p) => p.filter((s) => !(s.day === day && s.meal === meal && s.id === d.id))); setNote(labels.slotsFull); }
    });
  };

  const remove = (s: Slot) => {
    setSlots((p) => p.filter((x) => !(x.day === s.day && x.meal === s.meal && x.id === s.id)));
    start(async () => { const ok = await planRemove(s.day, s.meal, s.id); if (!ok) setSlots((p) => [...p, s]); });
  };

  const fill = () => start(async () => {
    const n = await planFill();
    setNote(`${n} ${labels.filled}`);
    // the server knows the new slots; reload the page data
    window.location.reload();
  });

  const clear = () => {
    if (!window.confirm(labels.clearWeekConfirm)) return;
    setSlots([]);
    start(async () => { await planClear(); });
  };

  // Dishes in the week already, so the picker does not offer them twice.
  const taken = useMemo(() => new Set(slots.map((s) => s.id)), [slots]);
  const pickable = useMemo(() => dishes.filter((d) => !taken.has(d.id)), [dishes, taken]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button onClick={fill} disabled={busy} className="btn-accent">{labels.fillWeek}</button>
        {slots.length > 0 && <button onClick={clear} disabled={busy} className="btn-ghost">{labels.clearWeek}</button>}
      </div>
      {note && <p className="mt-2 text-sm text-accent">{note}</p>}

      <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {days.map((day) => (
          <section key={day} className="tile p-3">
            <h2 className="font-extrabold">{dayLabels[day]}</h2>
            {meals.map((meal) => {
              const mine = at(day, meal);
              return (
                <div key={meal} className="mt-2">
                  <div className="text-xs font-bold text-muted uppercase tracking-wide">{labels[meal as "lunch" | "dinner"]}</div>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    {mine.map((s) => {
                      const d = byId.get(s.id);
                      return (
                        <button key={s.id} onClick={() => remove(s)} title={labels.remove}
                          className="rounded-xl overflow-hidden border border-line bg-card text-start">
                          <div className="aspect-[4/3] bg-accent-soft relative">{d && <DishImage photo={d.photo} />}</div>
                          <div className="p-2 text-sm font-bold leading-tight">{d ? slimName(d, lang) : s.id}</div>
                        </button>
                      );
                    })}
                    {Array.from({ length: Math.max(0, perMeal - mine.length) }).map((_, i) => (
                      <button key={`empty-${i}`} onClick={() => setOpen({ day, meal })}
                        className={clsx("rounded-xl border-2 border-dashed border-line aspect-[4/3] flex items-center justify-center text-sm font-bold text-accent",
                          open?.day === day && open.meal === meal && "border-accent bg-accent-soft")}>
                        + {labels.addOption}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 bg-bg overflow-y-auto">
          <div className="max-w-md mx-auto px-5 py-6 lg:max-w-4xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold">{dayLabels[open.day]} · {labels[open.meal as "lunch" | "dinner"]}</h2>
              <button onClick={() => setOpen(null)} className="btn-ghost">{labels.close}</button>
            </div>
            <div className="mt-4">
              <DishBrowser
                dishes={pickable}
                lang={lang}
                labels={browserLabels}
                dislikes={[]}
                initialMeal={open.meal}
                hideMoroccanToggle
                pick={{ selected: [], onToggle: add, meals: [open.meal] }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
