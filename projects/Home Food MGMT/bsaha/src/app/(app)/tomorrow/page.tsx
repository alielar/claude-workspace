import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { getMyPicks, getPool, isLocked, lockLabel, POOL_MEALS, tomorrowKey } from "@/lib/pool";
import { toSlim } from "@/lib/slim";
import { splitByDislikes } from "@/lib/dishes";
import { t } from "@/lib/i18n/dict";
import { MealChooser } from "@/components/MealChooser";

export default async function TomorrowPage() {
  const me = (await currentPerson())!;
  if (me.role === "grocery") redirect("/today");
  const L = me.lang;
  const day = tomorrowKey();
  const [pool, mine] = await Promise.all([getPool(day), getMyPicks(day, me.id)]);
  const locked = isLocked();

  // Each person sees the shortlist without the things they do not eat.
  const { shown } = splitByDislikes(pool.map((p) => p.dish), me);
  const visible = new Set(shown.map((d) => d.id));
  const items = pool.filter((p) => visible.has(p.dish.id)).map((p) => ({ meal: p.meal, dish: toSlim(p.dish) }));

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(L, "tomorrowChoose")}</h1>
      <p className="mt-1 text-muted">
        {locked ? t(L, "chooseLocked") : `${t(L, "chooseIntro")} ${t(L, "deadlineIs")} ${lockLabel()}.`}
      </p>

      {pool.length === 0 ? (
        <p className="mt-8 text-muted">{t(L, "poolEmpty")}</p>
      ) : (
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
