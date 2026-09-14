import Link from "next/link";
import clsx from "clsx";
import { MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { listReadyDishes, splitByDislikes } from "@/lib/dishes";
import { t } from "@/lib/i18n/dict";
import { DishTile } from "@/components/DishTile";

export default async function Menu({ searchParams }: { searchParams: Promise<{ meal?: string }> }) {
  const me = (await currentPerson())!;
  const sp = await searchParams;
  const meal: Meal = MEALS.includes(sp.meal as Meal) ? (sp.meal as Meal) : "lunch";
  const { shown, hidden } = splitByDislikes(await listReadyDishes(meal), me);

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(me.lang, "menu")}</h1>

      <div className="mt-4 grid grid-cols-3 gap-1 p-1 bg-card border border-line rounded-2xl">
        {MEALS.map((m) => (
          <Link
            key={m}
            href={`/menu?meal=${m}`}
            className={clsx(
              "text-center rounded-xl py-2.5 font-bold text-sm",
              m === meal ? "bg-accent text-accent-ink" : "text-muted",
            )}
          >
            {t(me.lang, m)}
          </Link>
        ))}
      </div>

      {shown.length === 0 && <p className="mt-8 text-muted">{t(me.lang, "noDishes")}</p>}

      <div className={clsx("mt-4 grid gap-3", me.simpleUi ? "grid-cols-1" : "grid-cols-2")}>
        {shown.map((d) => (
          <DishTile key={d.id} dish={d} lang={me.lang} simple={me.simpleUi} />
        ))}
      </div>

      {hidden > 0 && !me.isChild && (
        <p className="mt-4 text-sm text-muted text-center">
          {hidden} {t(me.lang, "hiddenByDislikes")}
        </p>
      )}

      <Link href={`/menu/add?meal=${meal}`} className="btn-soft w-full mt-6">
        {t(me.lang, "addDish")}
      </Link>
    </main>
  );
}
