import type { Person } from "@/db/schema";
import { MEALS } from "@/db/schema";
import { getMyMenu, getMyOptions, MY_PICKS_PER_MEAL } from "@/lib/mine";
import { tomorrowKey } from "@/lib/pool";
import { toSlim } from "@/lib/slim";
import { t } from "@/lib/i18n/dict";
import { MyPicker } from "@/components/MyPicker";

/** Tomorrow for someone with a menu of their own: up to three options per meal, from that menu. */
export async function MineTomorrow({ me }: { me: Person }) {
  const L = me.lang;
  const day = tomorrowKey();
  const [mine, options] = await Promise.all([getMyMenu(me.id), getMyOptions(day, me.id)]);
  const items = mine.flatMap(({ dish, meals }) => meals.map((meal) => ({ meal, dish: toSlim(dish) })));
  const initial = Object.fromEntries(MEALS.map((m) => [m, options.filter((o) => o.meal === m).map((o) => o.dish.id)])) as Record<typeof MEALS[number], number[]>;
  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(L, "myOptions")}</h1>
      <p className="mt-1 text-muted">{t(L, "pickThree")}</p>
      {mine.length === 0 && <p className="mt-3 font-bold text-accent">{t(L, "myMenuEmpty")}</p>}
      <div className="mt-6">
        <MyPicker items={items} initial={initial} lang={L} max={MY_PICKS_PER_MEAL} meals={[...MEALS]}
          labels={{ breakfast: t(L, "breakfast"), lunch: t(L, "lunch"), dinner: t(L, "dinner"), nothingForMeal: t(L, "nothingForMeal"), optionsFull: t(L, "optionsFull"), chosen: t(L, "chosen") }} />
      </div>
    </main>
  );
}
