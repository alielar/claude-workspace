"use client";

import { useState, useTransition } from "react";
import clsx from "clsx";
import type { Lang } from "@/db/schema";
import { formatQty } from "@/lib/scale";
import { lineName, type GroceryLine, type GroceryList as List } from "@/lib/grocery";
import { setGroceryTicks } from "@/app/(app)/week/actions";

export type GroceryLabels = { fresh: string; dry: string; breakfastStaples: string; copyList: string; copied: string; nothingPlanned: string; forDishes: string };

/**
 * The week's shopping list in three sections, tick boxes shared by everyone who shops, and a
 * copy button that puts the whole list on the clipboard as plain text for WhatsApp.
 */
export function GroceryList({ list, lang, labels, weekStart, initialTicks, big }: {
  list: List; lang: Lang; labels: GroceryLabels; weekStart: string; initialTicks: string[]; big?: boolean;
}) {
  const [ticks, setTicks] = useState<Set<string>>(new Set(initialTicks));
  const [copied, setCopied] = useState(false);
  const [, start] = useTransition();

  const toggle = (key: string) => {
    const next = new Set(ticks);
    if (next.has(key)) next.delete(key); else next.add(key);
    setTicks(next);
    start(async () => { await setGroceryTicks(weekStart, [...next]); });
  };

  const text = () => {
    const sec = (title: string, lines: GroceryLine[]) =>
      lines.length ? `${title}\n${lines.map((l) => `- ${lineName(l, lang)} ${formatQty(l.qty, l.unit, lang)}`).join("\n")}` : "";
    return [sec(labels.fresh, list.fresh), sec(labels.dry, list.dry), sec(labels.breakfastStaples, list.breakfast)].filter(Boolean).join("\n\n");
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text()); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* no clipboard */ }
  };

  const section = (title: string, lines: GroceryLine[], key: string) => lines.length === 0 ? null : (
    <section key={key} className="mt-6">
      <h2 className="text-lg font-extrabold">{title} <span className="text-muted text-sm font-semibold">{lines.filter((l) => ticks.has(`${key}:${l.key}`)).length}/{lines.length}</span></h2>
      <ul className="mt-2 tile divide-y divide-line">
        {lines.map((l) => {
          const k = `${key}:${l.key}`;
          const on = ticks.has(k);
          return (
            <li key={k}>
              <button onClick={() => toggle(k)} className={clsx("w-full flex items-center gap-3 px-4 text-start", big ? "py-3.5" : "py-2.5")}>
                <span className={clsx("shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center text-sm font-extrabold",
                  on ? "bg-accent border-accent text-accent-ink" : "border-line")}>{on ? "✓" : ""}</span>
                <span className={clsx("flex-1 min-w-0", on && "line-through text-muted")}>
                  <span className={clsx("block font-semibold", big && "text-lg")}>{lineName(l, lang)}</span>
                  {!big && l.dishes.length > 0 && <span className="block text-xs text-muted truncate">{labels.forDishes} {l.dishes.slice(0, 3).join(", ")}</span>}
                </span>
                <span className={clsx("shrink-0 font-bold text-muted", big && "text-lg")}>{formatQty(l.qty, l.unit, lang)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );

  const empty = list.fresh.length + list.dry.length + list.breakfast.length === 0;
  return (
    <div>
      {empty ? <p className="mt-4 text-muted">{labels.nothingPlanned}</p> : (
        <>
          <button onClick={copy} className="btn-soft w-full mt-4">{copied ? labels.copied : labels.copyList}</button>
          {section(labels.fresh, list.fresh, "fresh")}
          {section(labels.dry, list.dry, "dry")}
          {section(labels.breakfastStaples, list.breakfast, "bf")}
        </>
      )}
    </div>
  );
}
