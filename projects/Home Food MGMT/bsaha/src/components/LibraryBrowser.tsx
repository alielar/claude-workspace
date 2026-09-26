"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRemembered } from "@/lib/useRemembered";
import Link from "next/link";
import clsx from "clsx";
import { CATEGORIES, type Category, type Lang, type Meal } from "@/db/schema";
import { fold, highFibre, highProtein, inMeal, lowCarb, quick, slimName, type SlimDish } from "@/lib/dishMeta";
import { DishImage } from "./DishImage";
import { clearMenuForMeal, clearWholeMenu, deleteDishForGood, setOnMenu } from "@/app/(app)/library/actions";

export type LibraryLabels = Record<
  | "breakfast" | "lunch" | "dinner" | "search" | "searchHint" | "results" | "noResults" | "clear"
  | "f_protein" | "f_lowcarb" | "f_fibre" | "f_quick" | "f_veg" | "f_fish" | "f_chicken" | "f_meat"
  | "onMenu" | "addToMenu" | "onMenuCount" | "target" | "showAll" | "showOnMenu" | "showOffMenu"
  | "clearMeal" | "clearMealDone" | "clearAll" | "clearAllConfirm" | "deleteForever" | "deleteConfirm"
  | "moroccan" | "international" | "sortProtein" | "sortName" | "sortRating" | "allCategories"
  | "leftToPick" | "menuComplete" | "overTarget" | "showMore" | "seeAll" | "showLess" | "pickedSoFar"
  | `c_${Category}`,
  string
>;

type Filter = "protein" | "lowcarb" | "fibre" | "quick" | "veg" | "fish" | "chicken" | "meat";
const FILTERS: Filter[] = ["protein", "lowcarb", "fibre", "quick", "veg", "fish", "chicken", "meat"];
type Show = "all" | "on" | "off";
type Sort = "rating" | "protein" | "name";
const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];
/** Cards shown per category before "See all", and how many more each "Show more" adds. */
const PREVIEW = 6, PAGE = 40;

function matches(d: SlimDish, f: Filter): boolean {
  switch (f) {
    case "protein": return highProtein(d);
    case "lowcarb": return lowCarb(d);
    case "fibre": return highFibre(d);
    case "quick": return quick(d);
    case "veg": return d.tags.includes("vegetarian");
    case "fish": return d.tags.includes("fish");
    case "chicken": return d.tags.includes("chicken");
    case "meat": return d.tags.includes("red_meat");
  }
}

const chip = (on: boolean) =>
  clsx("chip shrink-0 py-1.5 px-3 text-sm border whitespace-nowrap", on ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line");

/**
 * The whole library for the admin who builds the menu: pick 30 lunches and 30 dinners.
 * A bar pinned to the top keeps the count and what is left in view while scrolling. Without a
 * search or filter, dishes come grouped by category with a short preview each, so 1,100 cards
 * never land at once; a search, a category or a filter gives one flat list that grows by pages.
 */
export function LibraryBrowser({
  dishes, lang, labels, target,
}: {
  dishes: SlimDish[]; lang: Lang; labels: LibraryLabels; target: number;
}) {
  /** Which meals each dish is on the menu for, kept here so a tap shows at once. */
  const [menuMeals, setLocal] = useState<Record<number, Meal[]>>(() =>
    Object.fromEntries(dishes.map((d) => [d.id, d.menuMeals])));
  const isOn = (id: number, m: Meal) => (menuMeals[id] ?? []).includes(m);
  /** Deleted on this screen, hidden at once without waiting for a reload. */
  const [gone, setGone] = useState<Set<number>>(new Set());
  // Filters survive opening a dish and coming back, so the admin continues where they were.
  const [meal, setMeal] = useRemembered<Meal>("library.meal", "lunch");
  const [show, setShow] = useRemembered<Show>("library.show", "all");
  const [cuisine, setCuisine] = useRemembered<"all" | "intl" | "moroccan">("library.cuisine", "all");
  const [sort, setSort] = useRemembered<Sort>("library.sort", "rating");
  const [q, setQ] = useRemembered("library.q", "");
  const [category, setCategory] = useRemembered<Category | null>("library.category", null);
  const [activeList, setActiveList] = useRemembered<Filter[]>("library.filters", []);
  const [expanded, setExpanded] = useRemembered<Category[]>("library.expanded", []);
  const active = useMemo(() => new Set(activeList), [activeList]);
  const setActive = (next: Set<Filter> | ((prev: Set<Filter>) => Set<Filter>)) =>
    setActiveList([...(typeof next === "function" ? next(new Set(activeList)) : next)]);
  const [, start] = useTransition();
  /** How many cards a flat list (or an expanded category) currently shows. */
  const [limit, setLimit] = useState<Record<string, number>>({});

  const hasMoroccan = useMemo(() => dishes.some((d) => d.cuisine === "Moroccan"), [dishes]);

  // On-menu counts per meal. A dish under two meals counts for both, which is what the cook sees.
  const counts = useMemo(() => {
    const c: Record<string, number> = { breakfast: 0, lunch: 0, dinner: 0 };
    for (const d of dishes) if (!gone.has(d.id)) for (const m of menuMeals[d.id] ?? []) c[m]++;
    return c;
  }, [dishes, menuMeals, gone]);
  const totalOn = useMemo(() => dishes.filter((d) => (menuMeals[d.id] ?? []).length && !gone.has(d.id)).length, [dishes, menuMeals, gone]);

  /** What the picked dishes of this meal are made of, so the 30 end up varied. */
  const mix = useMemo(() => {
    const m = { chicken: 0, fish: 0, meat: 0, veg: 0 };
    for (const d of dishes) {
      if (!isOn(d.id, meal) || gone.has(d.id)) continue;
      if (d.tags.includes("chicken")) m.chicken++;
      else if (d.tags.includes("fish")) m.fish++;
      else if (d.tags.includes("red_meat")) m.meat++;
      else if (d.tags.includes("vegetarian")) m.veg++;
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes, menuMeals, gone, meal]);

  const categories = useMemo(() => {
    const cs = new Set<Category>();
    for (const d of dishes) if (inMeal(d, meal)) for (const c of d.categories) cs.add(c);
    return CATEGORIES.filter((c) => cs.has(c));
  }, [dishes, meal]);

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const list = dishes.filter((d) => {
      if (gone.has(d.id)) return false;
      if (!inMeal(d, meal)) return false;
      if (show === "on" && !isOn(d.id, meal)) return false;
      if (show === "off" && isOn(d.id, meal)) return false;
      if (cuisine === "moroccan" && d.cuisine !== "Moroccan") return false;
      if (cuisine === "intl" && d.cuisine === "Moroccan") return false;
      if (category && !d.categories.includes(category)) return false;
      if (needle && !fold(`${d.nameEn} ${d.nameFr} ${d.nameAr} ${d.nameLatin} ${d.cuisine} ${d.ingredientsText}`).includes(needle)) return false;
      for (const f of active) if (!matches(d, f)) return false;
      return true;
    });
    // dishes without a photo go last whatever the sort
    return list.sort((a, b) => (b.photo ? 1 : 0) - (a.photo ? 1 : 0) ||
      (sort === "rating" ? (b.rating ?? 0) - (a.rating ?? 0) || a.nameEn.localeCompare(b.nameEn)
      : sort === "protein" ? b.protein - a.protein || a.nameEn.localeCompare(b.nameEn)
      : a.nameEn.localeCompare(b.nameEn)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dishes, meal, show, cuisine, category, q, active, sort, menuMeals, gone]);

  // Browsing (no search, category or filter, not "picked only") is grouped by category.
  const grouped = !q.trim() && !category && active.size === 0 && show !== "on";
  const sections = useMemo(() => {
    if (!grouped) return [];
    const by = new Map<Category, SlimDish[]>();
    for (const d of shown) {
      const c = d.categories[0] ?? "main";
      if (!by.has(c)) by.set(c, []);
      by.get(c)!.push(d);
    }
    return CATEGORIES.filter((c) => by.has(c)).map((c) => ({ c, list: by.get(c)! }));
  }, [grouped, shown]);

  // A new search or filter starts the flat list from the top again.
  useEffect(() => { setLimit({}); }, [q, category, activeList, show, meal, cuisine, sort]);

  const withMeal = (list: Meal[], m: Meal, on: boolean) => (on ? MEALS.filter((x) => x === m || list.includes(x)) : list.filter((x) => x !== m));

  /** Adds or removes the dish for the meal tab that is open, and no other. */
  const toggle = (d: SlimDish) => {
    const next = !isOn(d.id, meal);
    setLocal((p) => ({ ...p, [d.id]: withMeal(p[d.id] ?? [], meal, next) }));
    start(async () => {
      const ok = await setOnMenu(d.id, meal, next);
      if (!ok) setLocal((p) => ({ ...p, [d.id]: withMeal(p[d.id] ?? [], meal, !next) }));
    });
  };

  const clearMeal = () => {
    const ids = dishes.filter((d) => isOn(d.id, meal)).map((d) => d.id);
    if (ids.length === 0) return;
    setLocal((p) => ({ ...p, ...Object.fromEntries(ids.map((i) => [i, withMeal(p[i] ?? [], meal, false)])) }));
    start(async () => { await clearMenuForMeal(meal); });
  };

  const clearAll = () => {
    if (totalOn === 0 || !window.confirm(labels.clearAllConfirm)) return;
    setLocal(Object.fromEntries(dishes.map((d) => [d.id, []])));
    start(async () => { await clearWholeMenu(); });
  };

  const remove = (d: SlimDish) => {
    if (!window.confirm(labels.deleteConfirm)) return;
    setGone((p) => new Set(p).add(d.id));
    start(async () => {
      const ok = await deleteDishForGood(d.id);
      if (!ok) setGone((p) => { const n = new Set(p); n.delete(d.id); return n; });
    });
  };

  const toggleFilter = (f: Filter) =>
    setActive((prev) => { const n = new Set(prev); if (n.has(f)) n.delete(f); else n.add(f); return n; });

  const toggleExpanded = (c: Category) =>
    setExpanded(expanded.includes(c) ? expanded.filter((x) => x !== c) : [...expanded, c]);

  const nextSort: Record<Sort, Sort> = { rating: "protein", protein: "name", name: "rating" };
  const sortLabel: Record<Sort, string> = { rating: labels.sortRating, protein: labels.sortProtein, name: labels.sortName };

  const left = target - counts[meal];
  const pct = Math.min(100, Math.round((counts[meal] / target) * 100));

  const card = (d: SlimDish) => {
    const on = isOn(d.id, meal);
    const cat = d.categories[0];
    return (
      <div key={d.id} className={clsx("tile overflow-hidden flex flex-col", on && "border-accent ring-2 ring-accent")}>
        <Link href={`/menu/${d.slug}?from=library`} className="block">
          <div className="aspect-[4/3] bg-accent-soft relative">
            {d.photo ? (
              <DishImage photo={d.photo} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-accent text-4xl font-extrabold">{d.nameEn.slice(0, 1)}</div>
            )}
          </div>
        </Link>
        <div className="p-3 flex-1 flex flex-col">
          {cat && !grouped && <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{labels[`c_${cat}`]}</div>}
          <div className="text-sm font-bold leading-tight">{slimName(d, lang)}</div>
          <div className="text-xs text-muted mt-0.5">
            {d.protein} g · {d.kcal} kcal{d.rating ? ` · ${d.rating.toFixed(1)}` : ""}
          </div>
          <button onClick={() => toggle(d)}
            className={clsx("mt-2 w-full rounded-xl py-2 text-sm font-bold", on ? "bg-accent text-accent-ink" : "bg-accent-soft text-accent")}>
            {on ? labels.onMenu : labels.addToMenu}
          </button>
          <button onClick={() => remove(d)} className="mt-2 self-end text-xs text-muted underline py-1">
            {labels.deleteForever}
          </button>
        </div>
      </div>
    );
  };

  /** A grid that grows by a page at a time. `key` keeps each list's own count. */
  const paged = (key: string, list: SlimDish[], first: number) => {
    const n = limit[key] ?? first;
    return (
      <>
        <div className="mt-2 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">{list.slice(0, n).map(card)}</div>
        {list.length > n && (
          <button onClick={() => setLimit((p) => ({ ...p, [key]: n + PAGE }))} className="btn-soft w-full mt-3">
            {labels.showMore} · {list.length - n}
          </button>
        )}
      </>
    );
  };

  return (
    <div>
      {/* Pinned while scrolling: which meal, how many picked, how many to go. */}
      <div className="sticky top-0 z-20 -mx-5 px-5 pt-2 pb-2 bg-bg/95 backdrop-blur border-b border-line lg:-mx-10 lg:px-10">
        <div className="grid gap-1 p-1 bg-card border border-line rounded-2xl grid-cols-3">
          {MEALS.map((m) => (
            <button key={m} onClick={() => setMeal(m)}
              className={clsx("rounded-xl py-2 font-bold text-sm", m === meal ? "bg-accent text-accent-ink" : "text-muted")}>
              {labels[m]}
              <span className={clsx("block text-xs font-semibold", m === meal ? "opacity-80" : "text-muted")}>
                {counts[m]} / {target}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-accent-soft overflow-hidden">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 flex items-baseline justify-between gap-2 text-xs">
          <span className="font-bold text-accent">
            {left > 0 ? `${left} ${labels.leftToPick}` : left === 0 ? labels.menuComplete : `${-left} ${labels.overTarget}`}
          </span>
          {counts[meal] > 0 && (
            <span className="text-muted truncate">
              {labels.pickedSoFar}: {labels.f_chicken} {mix.chicken} · {labels.f_fish} {mix.fish} · {labels.f_meat} {mix.meat} · {labels.f_veg} {mix.veg}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 bg-card border border-line rounded-xl">
          {(["all", "on", "off"] as Show[]).map((v) => (
            <button key={v} onClick={() => setShow(v)}
              className={clsx("rounded-lg py-1.5 px-3 text-sm font-bold", show === v ? "bg-ink text-bg" : "text-muted")}>
              {v === "all" ? labels.showAll : v === "on" ? `${labels.showOnMenu} · ${counts[meal]}` : labels.showOffMenu}
            </button>
          ))}
        </div>
        {hasMoroccan && (
          <div className="flex gap-1 p-1 bg-card border border-line rounded-xl">
            {(["all", "intl", "moroccan"] as const).map((v) => (
              <button key={v} onClick={() => setCuisine(v)}
                className={clsx("rounded-lg py-1.5 px-3 text-sm font-bold", cuisine === v ? "bg-ink text-bg" : "text-muted")}>
                {v === "all" ? labels.showAll : v === "intl" ? labels.international : labels.moroccan}
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setSort(nextSort[sort])}
          className="chip py-1.5 px-3 text-sm border border-line bg-card text-muted">
          {sortLabel[sort]}
        </button>
        {totalOn > 0 && (
          <div className="flex gap-2 ms-auto">
            {counts[meal] > 0 && (
              <button onClick={clearMeal} className="chip py-1.5 px-3 text-sm border border-line bg-card text-accent">
                {labels.clearMeal}
              </button>
            )}
            <button onClick={clearAll} className="chip py-1.5 px-3 text-sm border border-line bg-card text-accent">
              {labels.clearAll}
            </button>
          </div>
        )}
      </div>

      <input value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={`${labels.search} · ${labels.searchHint}`} className="input mt-3" inputMode="search" enterKeyHint="search" />

      {categories.length > 1 && (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button onClick={() => setCategory(null)} className={chip(category === null)}>{labels.allCategories}</button>
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(category === c ? null : c)} className={chip(category === c)}>{labels[`c_${c}`]}</button>
          ))}
        </div>
      )}

      <div className="mt-2 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => toggleFilter(f)} className={chip(active.has(f))}>
            {labels[`f_${f}` as keyof LibraryLabels]}
          </button>
        ))}
        {(active.size > 0 || q || category) && (
          <button onClick={() => { setActive(new Set()); setQ(""); setCategory(null); }}
            className="chip shrink-0 py-1.5 px-3 text-sm border border-line text-accent whitespace-nowrap">{labels.clear}</button>
        )}
      </div>

      <p className="mt-2 text-xs text-muted">{shown.length} {labels.results}</p>
      {shown.length === 0 && <p className="mt-6 text-muted">{labels.noResults}</p>}

      {grouped ? (
        sections.map(({ c, list }) => {
          const open = expanded.includes(c);
          const picked = list.filter((d) => isOn(d.id, meal)).length;
          return (
            <section key={c} className="mt-6">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-lg font-extrabold">
                  {labels[`c_${c}`]} <span className="text-sm font-semibold text-muted">· {list.length}{picked ? ` · ${picked} ${labels.onMenu.toLowerCase()}` : ""}</span>
                </h2>
                {list.length > PREVIEW && (
                  <button onClick={() => toggleExpanded(c)} className="text-sm font-bold text-accent whitespace-nowrap">
                    {open ? labels.showLess : `${labels.seeAll} · ${list.length}`}
                  </button>
                )}
              </div>
              {open ? paged(c, list, PAGE) : (
                <div className="mt-2 grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4">{list.slice(0, PREVIEW).map(card)}</div>
              )}
            </section>
          );
        })
      ) : (
        paged("flat", shown, PAGE)
      )}
    </div>
  );
}
