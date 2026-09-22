import { sql } from "drizzle-orm";
import { db } from "@/db";
import { currentPerson } from "@/lib/session";
import { buildGroceryList } from "@/lib/grocery";
import { dayLabel, weekDays } from "@/lib/week";
import { t } from "@/lib/i18n/dict";
import { GroceryList } from "@/components/GroceryList";

/** The shopping list for the planned week. Everyone can read it; the grocery person lives here. */
export default async function GroceryPage() {
  const me = (await currentPerson())!;
  const L = me.lang;
  const days = weekDays();
  const list = await buildGroceryList(days);
  const saved = await db.all<{ value: string }>(sql`SELECT value FROM settings WHERE key = ${`grocery:${days[0]}`}`);
  let ticks: string[] = [];
  try { ticks = saved[0] ? (JSON.parse(saved[0].value) as string[]) : []; } catch { ticks = []; }
  const planned = list.fresh.length + list.dry.length > 0;

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(L, "groceryList")}</h1>
      <p className="mt-1 text-muted">
        {dayLabel(days[0], L)} – {dayLabel(days[days.length - 1], L)}
        {planned && ` · ${t(L, "forN").replace("{n}", String(list.people))}`}
      </p>
      {!planned && <p className="mt-1 text-sm text-muted">{t(L, "groceryIntro")}</p>}
      <GroceryList
        list={list}
        lang={L}
        weekStart={days[0]}
        initialTicks={ticks}
        big={me.role === "grocery" || me.role === "cook"}
        labels={{
          fresh: t(L, "fresh"), dry: t(L, "dry"), breakfastStaples: t(L, "breakfastStaples"),
          copyList: t(L, "copyList"), copied: t(L, "copied"), nothingPlanned: t(L, "nothingPlanned"), forDishes: t(L, "forDishes"),
        }}
      />
    </main>
  );
}
