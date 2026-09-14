import Link from "next/link";
import { MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { listDishes } from "@/lib/dishes";
import { toSlim } from "@/lib/slim";
import { browserLabels } from "@/lib/browserLabels";
import { t } from "@/lib/i18n/dict";
import { DishBrowser } from "@/components/DishBrowser";

/** One server render, then meals, search and filters all run on the phone. */
export default async function Menu({ searchParams }: { searchParams: Promise<{ meal?: string }> }) {
  const me = (await currentPerson())!;
  const sp = await searchParams;
  const meal: Meal = MEALS.includes(sp.meal as Meal) ? (sp.meal as Meal) : "lunch";
  const dishes = (await listDishes()).filter((d) => d.status === "ready").map(toSlim);

  return (
    <main>
      <h1 className="text-3xl font-extrabold mb-4">{t(me.lang, "menu")}</h1>
      <DishBrowser dishes={dishes} lang={me.lang} labels={browserLabels(me.lang)} simple={me.simpleUi} child={me.isChild} dislikes={me.dislikes ?? []} initialMeal={meal} />
      <Link href={`/menu/add?meal=${meal}`} className="btn-soft w-full mt-6">
        {t(me.lang, "addDish")}
      </Link>
    </main>
  );
}
