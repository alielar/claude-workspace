import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { breakfastMenu, getMyPicks, getPool, isLocked, lockLabel, POOL_MEALS, tomorrowKey } from "@/lib/pool";
import { toSlim } from "@/lib/slim";
import { splitByDislikes } from "@/lib/dishes";
import { t } from "@/lib/i18n/dict";
import { MealChooser } from "@/components/MealChooser";

export default async function TomorrowPage() {
  const me = (await currentPerson())!;
  if (me.role === "grocery") redirect("/today");
  const L = me.lang;
  const day = tomorrowKey();
  const [planned, breakfasts, mine] = await Promise.all([getPool(day), breakfastMenu(), getMyPicks(day, me.id)]);
  const locked = isLocked();

  // Lunch and dinner come from the week plan; breakfast is everyone's own pick from the menu.
  const pool = [...planned.filter((p) => p.meal !== "breakfast"), ...breakfasts.map((dish) => ({ meal: "breakfast" as const, dish }))];
  // Each person sees the options without the things they do not eat.
  const { shown } = splitByDislikes(pool.map((p) => p.dish), me);
  const visible = new Set(shown.map((d) => d.id));
  const items = pool.filter((p) => visible.has(p.dish.id)).map((p) => ({ meal: p.meal, dish: toSlim(p.dish) }));

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(L, "tomorrowChoose")}</h1>
      <p className="mt-1 text-muted">
        {locked ? t(L, "chooseLocked") : `${t(L, "chooseIntro")} ${t(L, "deadlineIs")} ${lockLabel()}.`}
      </p>

      {planned.length === 0 && <p className="mt-2 text-sm text-muted">{t(L, "poolEmpty")}</p>}
      <p className="mt-1 text-sm text-muted">{t(L, "breakfastHint")}</p>
      {pool.length === 0 ? null : (
        <div className="mt-6">
          <MealChooser
            pool={items}
            initial={mine}
            lang={L}
            locked={locked}
            meals={POOL_MEALS}
            child={me.isChild || me.simpleUi}
            labels={{
              breakfast: t(L, "breakfast"), lunch: t(L, "lunch"), dinner: t(L, "dinner"),
              chosen: t(L, "chosen"), nothingForMeal: t(L, "nothingForMeal"), lockedNow: t(L, "lockedNow"),
              tapToChange: t(L, "tapToChange"), tapToChoose: t(L, "tapToChoose"),
            }}
          />
        </div>
      )}
    </main>
  );
}
