"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { Lang, Meal } from "@/db/schema";
import { fold, highFibre, highProtein, quick, slimName, type SlimDish } from "@/lib/dishMeta";
import { DishImage } from "./DishImage";
import { clearMenuForMeal, setOnMenu } from "@/app/(app)/library/actions";

export type LibraryLabels = Record<
  | "breakfast" | "lunch" | "dinner" | "search" | "searchHint" | "results" | "noResults" | "clear"
  | "f_protein" | "f_fibre" | "f_quick" | "f_veg" | "f_fish" | "f_chicken" | "f_meat"
  | "onMenu" | "addToMenu" | "onMenuCount" | "target" | "showAll" | "showOnMenu" | "showOffMenu"
  | "clearMeal" | "clearMealDone" | "moroccan" | "international" | "sortProtein" | "sortName",
  string
>;

type Filter = "protein" | "fibre" | "quick" | "veg" | "fish" | "chicken" | "meat";
const FILTERS: Filter[] = ["protein", "fibre", "quick", "veg", "fish", "chicken", "meat"];
type Show = "all" | "on" | "off";
const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];

function matches(d: SlimDish, f: Filter): boolean {
  switch (f) {
    case "protein": return highProtein(d);
    case "fibre": return highFibre(d);
    case "quick": return quick(d);
    case "veg": return d.tags.includes("vegetarian");
    case "fish": return d.tags.includes("fish");
    case "chicken": return d.tags.includes("chicken");
    case "meat": return d.tags.includes("red_meat");
  }
}

/** The whole library, with a tick on every dish saying whether it is on the menu. */
export function LibraryBrowser({
  dishes, lang, labels, target,
}: {
  dishes: SlimDish[]; lang: Lang; labels: LibraryLabels; target: number;
}) {
  const [onMenu, setLocal] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(dishes.map((d) => [d.id, d.onMenu])));
  const [meal, setMeal] = useState<Meal>("lunch");
  const [show, setShow] = useState<Show>("all");
  const [cuisine, setCuisine] = useState<"all" | "intl" | "moroccan">("all");
  const [sort, setSort] = useState<"protein" | "name">("protein");
  const [q, setQ] = useState("");
  const [active, setActive] = useState<Set<Filter>>(new Set());
  const [, start] = useTransition();

  const counts = useMemo(() => {
    const c: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const d of dishes) if (onMenu[d.id]) c[d.meal]++;
    return c;
  }, [dishes, onMenu]);

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const list = dishes.filter((d) => {
      if (d.meal !== meal) return false;
      if (show === "on" && !onMenu[d.id]) return false;
      if (show === "off" && onMenu[d.id]) return false;
      if (cuisine === "moroccan" && d.cuisine !== "Moroccan") return false;
      if (cuisine === "intl" && d.cuisine === "Moroccan") return false;
      if (needle && !fold(`${d.nameEn} ${d.nameFr} ${d.nameAr} ${d.nameLatin} ${d.cuisine} ${d.ingredientsText}`).includes(needle)) return false;
      for (const f of active) if (!matches(d, f)) return false;
      return true;
    });
    return list.sort((a, b) => (sort === "protein" ? b.protein - a.protein || a.nameEn.localeCompare(b.nameEn) : a.nameEn.localeCompare(b.nameEn)));
  }, [dishes, meal, show, cuisine, q, active, sort, onMenu]);

  const toggle = (d: SlimDish) => {
    const next = !onMenu[d.id];
    setLocal((p) => ({ ...p, [d.id]: next }));
    start(async () => {
      const ok = await setOnMenu(d.id, next);
      if (!ok) setLocal((p) => ({ ...p, [d.id]: !next }));
    });
  };

  const clearMeal = () => {
    const ids = dishes.filter((d) => d.meal === meal && onMenu[d.id]).map((d) => d.id);
    if (ids.length === 0) return;
    setLocal((p) => ({ ...p, ...Object.fromEntries(ids.map((i) => [i, false])) }));
    start(async () => { await clearMenuForMeal(meal); });
  };

  const toggleFilter = (f: Filter) =>
    setActive((prev) => { const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n; });

  return (
    <div>
      <div className="grid gap-1 p-1 bg-card border border-line rounded-2xl grid-cols-3">
        {MEALS.map((m) => (
          <button key={m} onClick={() => setMeal(m)}
            className={clsx("rounded-xl py-2.5 font-bold text-sm", m === meal ? "bg-accent text-accent-ink" : "text-muted")}>
            {labels[m]}
            <span className={clsx("block text-xs font-semibold", m === meal ? "opacity-80" : "text-muted")}>
              {counts[m]} / {target}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 bg-card border border-line rounded-xl">
          {(["all", "on", "off"] as Show[]).map((v) => (
            <button key={v} onClick={() => setShow(v)}
              className={clsx("rounded-lg py-1.5 px-3 text-sm font-bold", show === v ? "bg-ink text-bg" : "text-muted")}>
              {v === "all" ? labels.showAll : v === "on" ? labels.showOnMenu : labels.showOffMenu}
            </button>
          ))}
        </div>
        <div className="flex gap-1 p-1 bg-card border border-line rounded-xl">
          {(["all", "intl", "moroccan"] as const).map((v) => (
            <button key={v} onClick={() => setCuisine(v)}
              className={clsx("rounded-lg py-1.5 px-3 text-sm font-bold", cuisine === v ? "bg-ink text-bg" : "text-muted")}>
              {v === "all" ? labels.showAll : v === "intl" ? labels.international : labels.moroccan}
            </button>
          ))}
        </div>
        <button onClick={() => setSort(sort === "protein" ? "name" : "protein")}
          className="chip py-1.5 px-3 text-sm border border-line bg-card text-muted">
          {sort === "protein" ? labels.sortProtein : labels.sortName}
        </button>
        {counts[meal] > 0 && (
          <button onClick={clearMeal} className="chip py-1.5 px-3 text-sm border border-line bg-card text-accent ms-auto">
            {labels.clearMeal}
          </button>
        )}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`${labels.search} · ${labels.searchHint}`} className="input mt-3" inputMode="search" enterKeyHint="search" />

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => toggleFilter(f)}
            className={clsx("chip shrink-0 py-1.5 px-3 text-sm border whitespace-nowrap",
              active.has(f) ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line")}>
            {labels[`f_${f}` as keyof LibraryLabels]}
          </button>
        ))}
        {(active.size > 0 || q) && (
          <button onClick={() => { setActive(new Set()); setQ(""); }}
            className="chip shrink-0 py-1.5 px-3 text-sm border border-line text-accent whitespace-nowrap">{labels.clear}</button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">{shown.length} {labels.results}</p>
      {shown.length === 0 && <p className="mt-6 text-muted">{labels.noResults}</p>}

      <div className="mt-2 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        {shown.map((d) => {
          const on = onMenu[d.id];
          return (
            <div key={d.id} className={clsx("tile overflow-hidden flex flex-col", on && "border-accent ring-2 ring-accent")}>
              <Link href={`/menu/${d.slug}`} className="block">
                <div className="aspect-[4/3] bg-accent-soft relative">
                  <DishImage photo={d.photo} />
                </div>
              </Link>
              <div className="p-3 flex-1 flex flex-col">
                <div className="text-sm font-bold leading-tight">{slimName(d, lang)}</div>
                <div className="text-xs text-muted mt-0.5">{d.protein} g · {d.kcal} kcal</div>
                <button onClick={() => toggle(d)}
                  className={clsx("mt-2 w-full rounded-xl py-2 text-sm font-bold", on ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent")}>
                  {on ? labels.onMenu : labels.addToMenu}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
