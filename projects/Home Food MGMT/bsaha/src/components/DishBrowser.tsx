"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Lang, Meal } from "@/db/schema";
import { fold, highFibre, highProtein, lightness, quick, slimName, type SlimDish } from "@/lib/dishMeta";
import { DishImage } from "./DishImage";

type Labels = Record<
  | "breakfast" | "lunch" | "dinner" | "mainMenu" | "moroccanMenu" | "search" | "searchHint" | "results" | "noResults" | "clear"
  | "f_light" | "f_balanced" | "f_hearty" | "f_protein" | "f_fibre" | "f_quick" | "f_veg" | "f_fish" | "f_chicken" | "f_meat"
  | "hiddenByDislikes" | "inPool" | "healthy" | "rich",
  string
>;

type Filter = "light" | "balanced" | "hearty" | "protein" | "fibre" | "quick" | "veg" | "fish" | "chicken" | "meat";
const FILTERS: Filter[] = ["light", "balanced", "hearty", "protein", "fibre", "quick", "veg", "fish", "chicken", "meat"];

export type BrowserProps = {
  dishes: SlimDish[];
  lang: Lang;
  labels: Labels;
  simple?: boolean;
  child?: boolean;
  dislikes: string[];
  initialMeal?: Meal;
  /** Cook's pool picker: which dishes are already in, a tap toggles instead of navigating. */
  pick?: { selected: number[]; onToggle: (dish: SlimDish) => void; meals: Meal[] };
  hideMoroccanToggle?: boolean;
};

function matches(d: SlimDish, f: Filter): boolean {
  switch (f) {
    case "light": case "balanced": case "hearty": return lightness(d.meal, d.kcal) === f;
    case "protein": return highProtein(d);
    case "fibre": return highFibre(d);
    case "quick": return quick(d);
    case "veg": return d.tags.includes("vegetarian");
    case "fish": return d.tags.includes("fish");
    case "chicken": return d.tags.includes("chicken");
    case "meat": return d.tags.includes("red_meat");
  }
}

export function DishBrowser({ dishes, lang, labels, simple, child, dislikes, initialMeal = "lunch", pick, hideMoroccanToggle }: BrowserProps) {
  const meals: Meal[] = pick?.meals ?? ["breakfast", "lunch", "dinner"];
  const [meal, setMeal] = useState<Meal>(meals.includes(initialMeal) ? initialMeal : meals[0]);
  const [moroccan, setMoroccan] = useState(false);
  const [rich, setRich] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Set<Filter>>(new Set());
  const bad = useMemo(() => new Set(dislikes), [dislikes]);

  const { shown, hidden } = useMemo(() => {
    const needle = fold(q.trim());
    let hidden = 0;
    const shown = dishes.filter((d) => {
      if (d.meal !== meal) return false;
      if (moroccan ? d.cuisine !== "Moroccan" || d.lean === rich : !d.inMain) return false;
      if (needle && !fold(`${d.nameEn} ${d.nameFr} ${d.nameAr} ${d.nameLatin} ${d.cuisine} ${d.ingredientsText}`).includes(needle)) return false;
      for (const f of active) if (!matches(d, f)) return false;
      if (d.tags.some((tag) => bad.has(tag))) { hidden++; return false; }
      return true;
    });
    return { shown, hidden };
  }, [dishes, meal, moroccan, rich, q, active, bad]);

  const toggle = (f: Filter) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else {
        if (f === "light" || f === "balanced" || f === "hearty") { next.delete("light"); next.delete("balanced"); next.delete("hearty"); }
        next.add(f);
      }
      return next;
    });

  const selected = pick ? new Set(pick.selected) : null;

  return (
    <div>
      {!hideMoroccanToggle && (
        <div className="grid grid-cols-2 gap-1 p-1 bg-card border border-line rounded-2xl">
          {[false, true].map((m) => (
            <button key={String(m)} onClick={() => setMoroccan(m)} className={clsx("rounded-xl py-2.5 font-bold text-sm", moroccan === m ? "bg-ink text-bg" : "text-muted")}>
              {m ? labels.moroccanMenu : labels.mainMenu}
            </button>
          ))}
        </div>
      )}

      {moroccan && !hideMoroccanToggle && (
        <div className="mt-2 grid grid-cols-2 gap-1 p-1 bg-card border border-line rounded-2xl">
          {[false, true].map((r) => (
            <button key={String(r)} onClick={() => setRich(r)} className={clsx("rounded-xl py-2 font-bold text-sm", rich === r ? "bg-accent-soft text-accent" : "text-muted")}>
              {r ? labels.rich : labels.healthy}
            </button>
          ))}
        </div>
      )}

      <div className={clsx("mt-3 grid gap-1 p-1 bg-card border border-line rounded-2xl", meals.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
        {meals.map((m) => (
          <button key={m} onClick={() => setMeal(m)} className={clsx("rounded-xl py-2.5 font-bold text-sm", m === meal ? "bg-accent text-accent-ink" : "text-muted")}>
            {labels[m]}
          </button>
        ))}
      </div>

      {!simple && (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${labels.search} · ${labels.searchHint}`}
            className="input mt-3"
            inputMode="search"
            enterKeyHint="search"
          />
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible [scrollbar-width:none]">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => toggle(f)}
                className={clsx("chip shrink-0 py-1.5 px-3 text-sm border whitespace-nowrap", active.has(f) ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line")}
              >
                {labels[`f_${f}` as keyof Labels]}
              </button>
            ))}
            {(active.size > 0 || q) && (
              <button onClick={() => { setActive(new Set()); setQ(""); }} className="chip shrink-0 py-1.5 px-3 text-sm border border-line text-accent whitespace-nowrap">
                {labels.clear}
              </button>
            )}
          </div>
        </>
      )}

      <p className="mt-2 text-xs text-muted">{shown.length} {labels.results}{hidden > 0 && !child ? ` · ${hidden} ${labels.hiddenByDislikes}` : ""}</p>
      {shown.length === 0 && <p className="mt-6 text-muted">{labels.noResults}</p>}

      <div className={clsx("mt-2 grid gap-3", simple ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5")}>
        {shown.map((d) => {
          const inner = (
            <>
              <div className="aspect-[4/3] bg-accent-soft relative">
                {d.photo ? (
                  <DishImage photo={d.photo} />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-accent text-4xl font-extrabold">{d.nameEn.slice(0, 1)}</div>
                )}
                {selected?.has(d.id) && (
                  <span className="absolute top-2 end-2 chip bg-accent text-accent-ink py-1 px-2.5 text-xs">{labels.inPool}</span>
                )}
              </div>
              <div className="p-3">
                <div className={simple ? "text-lg font-extrabold leading-tight" : "text-base font-bold leading-tight"}>{slimName(d, lang)}</div>
                {!simple && lang !== "ar" && <div className="text-sm text-muted mt-0.5">{d.nameLatin}</div>}
                {!simple && !child && (
                  <div className="text-xs text-muted mt-1">{d.kcal} kcal · {d.protein} g</div>
                )}
              </div>
            </>
          );
          return pick ? (
            <button key={d.id} onClick={() => pick.onToggle(d)} className={clsx("tile overflow-hidden text-start", selected?.has(d.id) && "border-accent ring-2 ring-accent")}>
              {inner}
            </button>
          ) : (
            <Link key={d.id} href={`/menu/${d.slug}`} className="tile overflow-hidden block">
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
