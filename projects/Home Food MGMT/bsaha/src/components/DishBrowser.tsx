"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { CATEGORIES, FOOD_GROUPS, type Category, type FoodGroup, type Lang, type Meal } from "@/db/schema";
import { fold, highFibre, highProtein, inMeal, lightness, lowCarb, quick, slimName, type SlimDish } from "@/lib/dishMeta";
import { DishImage } from "./DishImage";

type Labels = Record<
  | "breakfast" | "lunch" | "dinner" | "mainMenu" | "moroccanMenu" | "search" | "searchHint" | "results" | "noResults" | "clear"
  | "f_light" | "f_balanced" | "f_hearty" | "f_protein" | "f_lowcarb" | "f_fibre" | "f_quick" | "f_veg" | "f_fish" | "f_chicken" | "f_meat"
  | "hiddenByDislikes" | "inPool" | "healthy" | "rich" | "allCategories" | "allGroups"
  | `c_${Category}` | `g_${FoodGroup}`,
  string
>;

type Filter = "light" | "balanced" | "hearty" | "protein" | "lowcarb" | "fibre" | "quick" | "veg" | "fish" | "chicken" | "meat";
const FILTERS: Filter[] = ["protein", "lowcarb", "light", "balanced", "hearty", "fibre", "quick", "veg", "fish", "chicken", "meat"];

export type BrowserProps = {
  dishes: SlimDish[];
  lang: Lang;
  labels: Labels;
  simple?: boolean;
  child?: boolean;
  dislikes: string[];
  initialMeal?: Meal;
  /** Cook's pool picker: which dishes are already in, a tap toggles instead of navigating. */
  pick?: { selected: number[]; onToggle: (dish: SlimDish, meal: Meal) => void; meals: Meal[] };
  hideMoroccanToggle?: boolean;
  /** Which screen this browser sits on, so a dish page can send the reader back to it. */
  from?: string;
};

function matches(d: SlimDish, f: Filter): boolean {
  switch (f) {
    case "light": case "balanced": case "hearty": return lightness(d.meal, d.kcal) === f;
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

/** Horizontal, thumb-scrollable row of chips. */
function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2 flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible [scrollbar-width:none]">
      {children}
    </div>
  );
}

export function DishBrowser({ dishes, lang, labels, simple, child, dislikes, initialMeal = "lunch", pick, hideMoroccanToggle, from }: BrowserProps) {
  const meals: Meal[] = pick?.meals ?? ["breakfast", "lunch", "dinner"];
  const [meal, setMeal] = useState<Meal>(meals.includes(initialMeal) ? initialMeal : meals[0]);
  const [moroccan, setMoroccan] = useState(false);
  const [rich, setRich] = useState(false);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<Category | null>(null);
  const [group, setGroup] = useState<FoodGroup | null>(null);
  const [active, setActive] = useState<Set<Filter>>(new Set());
  const bad = useMemo(() => new Set(dislikes), [dislikes]);

  // The Moroccan menu only exists while there are Moroccan dishes to show in it.
  const hasMoroccan = useMemo(() => dishes.some((d) => d.cuisine === "Moroccan"), [dishes]);
  const showMoroccanToggle = hasMoroccan && !hideMoroccanToggle;
  const showCategories = useMemo(() => dishes.some((d) => d.categories.length > 0), [dishes]);

  // Only offer the categories and groups that exist under the current meal, so no chip leads to an empty grid.
  const { categories, groups } = useMemo(() => {
    const cs = new Set<Category>();
    const gs = new Set<FoodGroup>();
    for (const d of dishes) {
      if (!inMeal(d, meal)) continue;
      if (moroccan ? d.cuisine !== "Moroccan" : !d.inMain) continue;
      for (const c of d.categories) cs.add(c);
      for (const g of d.foodGroups) gs.add(g);
    }
    return { categories: CATEGORIES.filter((c) => cs.has(c)), groups: FOOD_GROUPS.filter((g) => gs.has(g)) };
  }, [dishes, meal, moroccan]);

  const { shown, hidden } = useMemo(() => {
    const needle = fold(q.trim());
    let hidden = 0;
    const shown = dishes.filter((d) => {
      if (!inMeal(d, meal)) return false;
      if (moroccan ? d.cuisine !== "Moroccan" || d.lean === rich : !d.inMain) return false;
      if (category && !d.categories.includes(category)) return false;
      if (group && !d.foodGroups.includes(group)) return false;
      if (needle && !fold(`${d.nameEn} ${d.nameFr} ${d.nameAr} ${d.nameLatin} ${d.cuisine} ${d.ingredientsText}`).includes(needle)) return false;
      for (const f of active) if (!matches(d, f)) return false;
      if (d.tags.some((tag) => bad.has(tag))) { hidden++; return false; }
      return true;
    });
    // Best rated first, like the source library, then by name.
    shown.sort((a, b) => (b.photo ? 1 : 0) - (a.photo ? 1 : 0) || (b.rating ?? 0) - (a.rating ?? 0) || a.nameEn.localeCompare(b.nameEn));
    return { shown, hidden };
  }, [dishes, meal, moroccan, rich, q, category, group, active, bad]);

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

  const anyFilter = active.size > 0 || q || category || group;
  const clearAll = () => { setActive(new Set()); setQ(""); setCategory(null); setGroup(null); };
  const selected = pick ? new Set(pick.selected) : null;

  return (
    <div>
      {showMoroccanToggle && (
        <div className="grid grid-cols-2 gap-1 p-1 bg-card border border-line rounded-2xl">
          {[false, true].map((m) => (
            <button key={String(m)} onClick={() => setMoroccan(m)} className={clsx("rounded-xl py-2.5 font-bold text-sm", moroccan === m ? "bg-ink text-bg" : "text-muted")}>
              {m ? labels.moroccanMenu : labels.mainMenu}
            </button>
          ))}
        </div>
      )}

      {moroccan && showMoroccanToggle && (
        <div className="mt-2 grid grid-cols-2 gap-1 p-1 bg-card border border-line rounded-2xl">
          {[false, true].map((r) => (
            <button key={String(r)} onClick={() => setRich(r)} className={clsx("rounded-xl py-2 font-bold text-sm", rich === r ? "bg-accent-soft text-accent" : "text-muted")}>
              {r ? labels.rich : labels.healthy}
            </button>
          ))}
        </div>
      )}

      <div className={clsx("grid gap-1 p-1 bg-card border border-line rounded-2xl", showMoroccanToggle && "mt-3", meals.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
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
          {showCategories && categories.length > 1 && (
            <ChipRow>
              <button onClick={() => setCategory(null)} className={chip(category === null)}>{labels.allCategories}</button>
              {categories.map((c) => (
                <button key={c} onClick={() => setCategory(category === c ? null : c)} className={chip(category === c)}>{labels[`c_${c}`]}</button>
              ))}
            </ChipRow>
          )}
          {showCategories && groups.length > 1 && (
            <ChipRow>
              <button onClick={() => setGroup(null)} className={chip(group === null)}>{labels.allGroups}</button>
              {groups.map((g) => (
                <button key={g} onClick={() => setGroup(group === g ? null : g)} className={chip(group === g)}>{labels[`g_${g}`]}</button>
              ))}
            </ChipRow>
          )}
          <ChipRow>
            {FILTERS.map((f) => (
              <button key={f} onClick={() => toggle(f)} className={chip(active.has(f))}>
                {labels[`f_${f}` as keyof Labels]}
              </button>
            ))}
            {anyFilter && (
              <button onClick={clearAll} className="chip shrink-0 py-1.5 px-3 text-sm border border-line text-accent whitespace-nowrap">
                {labels.clear}
              </button>
            )}
          </ChipRow>
        </>
      )}

      <p className="mt-2 text-xs text-muted">{shown.length} {labels.results}{hidden > 0 && !child ? ` · ${hidden} ${labels.hiddenByDislikes}` : ""}</p>
      {shown.length === 0 && <p className="mt-6 text-muted">{labels.noResults}</p>}

      <div className={clsx("mt-2 grid gap-3", simple ? "grid-cols-1 md:grid-cols-2 xl:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5")}>
        {shown.map((d) => {
          const cat = d.categories[0];
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
                {!simple && cat && <div className="text-[11px] font-bold uppercase tracking-wide text-muted">{labels[`c_${cat}`]}</div>}
                <div className={simple ? "text-lg font-extrabold leading-tight" : "text-base font-bold leading-tight"}>{slimName(d, lang)}</div>
                {!simple && lang !== "ar" && d.nameLatin && <div className="text-sm text-muted mt-0.5">{d.nameLatin}</div>}
                {!simple && !child && (
                  <div className="text-xs text-muted mt-1">{d.kcal} kcal · {d.protein} g</div>
                )}
              </div>
            </>
          );
          return pick ? (
            <button key={d.id} onClick={() => pick.onToggle(d, meal)} className={clsx("tile overflow-hidden text-start", selected?.has(d.id) && "border-accent ring-2 ring-accent")}>
              {inner}
            </button>
          ) : (
            <Link key={d.id} href={`/menu/${d.slug}${from ? `?from=${from}` : ""}`} className="tile overflow-hidden block">
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
