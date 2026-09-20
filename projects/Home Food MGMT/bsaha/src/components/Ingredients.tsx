"use client";

import { useState, useSyncExternalStore } from "react";
import clsx from "clsx";
import type { Ingredient, Lang } from "@/db/schema";
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

/**
 * The ingredient list with a row of people counts above it. Quantities follow the count.
 * Starts from `initial` (the number who ordered the dish, when known), else the count last
 * used on this device, else what the recipe was written for.
 */
export function Ingredients({
  items, base, lang, initial, big, labels,
}: {
  items: Ingredient[];
  base: number;
  lang: Lang;
  initial?: number;
  big?: boolean;
  labels: { title: string; howMany: string; forOne: string; forN: string };
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

  const heading = people === 1 ? labels.forOne : labels.forN.replace("{n}", String(people));

  return (
    <section className="mt-8">
      <h2 className="text-xl font-extrabold">{labels.title}</h2>
      <p className="text-sm text-muted">{heading}</p>

      <div className="mt-2 flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <span className="text-sm text-muted shrink-0">{labels.howMany}</span>
        {peopleOptions(base).map((n) => (
          <button key={n} type="button" onClick={() => choose(n)}
            className={clsx("shrink-0 rounded-xl min-w-11 h-11 px-3 font-extrabold text-lg border",
              n === people ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line")}>
            {n}
          </button>
        ))}
      </div>

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
  );
}
