"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import type { Lang, Meal } from "@/db/schema";
import { slimName, type SlimDish } from "@/lib/dishMeta";
import { DishBrowser, type BrowserProps } from "./DishBrowser";
import { togglePool } from "@/app/(app)/pool/actions";

type Sel = { meal: Meal; id: number };

/** Tomorrow's pool: the selected chips on top, the browser below. Taps update at once, the server catches up. */
export function PoolPicker({
  dishes, lang, labels, initial, cap, poolLabels,
}: {
  dishes: SlimDish[]; lang: Lang; labels: BrowserProps["labels"]; initial: Sel[]; cap: number;
  poolLabels: { lunch: string; dinner: string; poolCount: string; poolFull: string; remove: string };
}) {
  const [sel, setSel] = useState<Sel[]>(initial);
  const [full, setFull] = useState(false);
  const [, start] = useTransition();
  const byId = new Map(dishes.map((d) => [d.id, d]));

  const toggle = (meal: Meal, id: number) => {
    const has = sel.some((s) => s.meal === meal && s.id === id);
    if (!has && sel.length >= cap) { setFull(true); return; }
    setFull(false);
    setSel((prev) => (has ? prev.filter((s) => !(s.meal === meal && s.id === id)) : [...prev, { meal, id }]));
    start(async () => {
      const n = await togglePool(meal, id);
      if (n === -1) { setFull(true); setSel((prev) => prev.filter((s) => !(s.meal === meal && s.id === id))); }
    });
  };

  return (
    <div>
      <p className={clsx("text-sm font-bold", sel.length >= cap ? "text-accent" : "text-muted")}>
        {sel.length} / {cap} {poolLabels.poolCount}
      </p>
      {full && <p className="mt-1 text-sm text-accent">{poolLabels.poolFull}</p>}

      {(["lunch", "dinner"] as const).map((meal) => {
        const items = sel.filter((s) => s.meal === meal);
        return (
          <section key={meal} className="mt-3">
            <h2 className="text-sm font-bold text-muted uppercase tracking-wide">{poolLabels[meal]} · {items.length}</h2>
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
          pick={{ selected: sel.map((s) => s.id), onToggle: (d) => toggle(d.meal, d.id), meals: ["lunch", "dinner"] }}
        />
      </div>
    </div>
  );
}
