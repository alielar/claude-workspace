import { redirect } from "next/navigation";
import { MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { getMyMenu } from "@/lib/mine";
import { toSlim } from "@/lib/slim";
import { browserLabels } from "@/lib/browserLabels";
import { t } from "@/lib/i18n/dict";
import { DishBrowser } from "@/components/DishBrowser";
import { BuildMineButton } from "@/components/BuildMineButton";

/** My own menu: what I pick tomorrow's options from. Browsed like the family menu, filled by rule or by hand from any dish page. */
export default async function MinePage({ searchParams }: { searchParams: Promise<{ meal?: string }> }) {
  const me = (await currentPerson())!;
  if (!me.ownMenu) redirect("/menu");
  const sp = await searchParams;
  const meal: Meal = MEALS.includes(sp.meal as Meal) ? (sp.meal as Meal) : "lunch";
  const mine = await getMyMenu(me.id);
  // The browser filters on menuMeals: here that means "the meals this dish is on MY menu for".
  const dishes = mine.map(({ dish, meals }) => ({ ...toSlim(dish), onMenu: true, menuMeals: meals }));
  const counts = MEALS.map((m) => `${t(me.lang, m)} ${dishes.filter((d) => d.menuMeals.includes(m)).length}`).join(" · ");

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(me.lang, "myMenu")}</h1>
      <p className="mt-1 text-muted">{t(me.lang, "myMenuIntro")}</p>
      <p className="mt-1 text-sm text-muted">{counts}</p>
      {dishes.length === 0 && <p className="mt-4 font-bold text-accent">{t(me.lang, "myMenuEmpty")}</p>}
      <div className="mt-4">
        <DishBrowser dishes={dishes} lang={me.lang} labels={browserLabels(me.lang)} simple={false} child={false} dislikes={[]} initialMeal={meal} from="mine" hideMoroccanToggle />
      </div>
      <div className="mt-6">
        <BuildMineButton label={t(me.lang, "buildMyMenu")} done={t(me.lang, "buildMyMenuDone")} />
      </div>
    </main>
  );
}
