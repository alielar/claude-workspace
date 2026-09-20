import Link from "next/link";
import { currentPerson } from "@/lib/session";
import { getPicks, getPool, isLocked, lockLabel, POOL_MEALS, tomorrowKey } from "@/lib/pool";
import { dishName } from "@/lib/dishes";
import { thumb } from "@/lib/dishMeta";
import { t } from "@/lib/i18n/dict";
import type { Dish, Lang, Meal } from "@/db/schema";

function DishRow({ dish, lang, note }: { dish: Dish; lang: Lang; note?: string }) {
  return (
    <Link href={`/menu/${dish.slug}`} className="tile flex items-center gap-3 p-2">
      <span className="w-20 h-16 rounded-lg bg-accent-soft overflow-hidden shrink-0 relative">
        {dish.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb(dish.photoUrl) ?? undefined} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-tight">{dishName(dish, lang)}</span>
        {note && <span className="block text-xs text-muted mt-0.5">{note}</span>}
      </span>
    </Link>
  );
}

export default async function Today() {
  const me = (await currentPerson())!;
  const L = me.lang;
  const day = tomorrowKey();
  const [pool, picks] = await Promise.all([getPool(day), getPicks(day)]);
  const locked = isLocked();
  const isCook = me.role === "cook";
  const canCurate = isCook || me.isAdmin;

  /** What the household chose for a meal, without repeating a dish two people both chose. */
  const chosenFor = (meal: Meal) => {
    const seen = new Set<number>();
    return picks.filter((p) => p.meal === meal && !seen.has(p.dish.id) && seen.add(p.dish.id));
  };

  return (
    <main>
      <h1 className="text-3xl font-extrabold">
        {t(L, "hello")} {me.name}
      </h1>

      <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold">{isCook ? t(L, "tomorrowOrders") : t(L, "tomorrowChoose")}</h2>
          {canCurate ? (
            <Link href="/pool" className="text-accent font-semibold shrink-0">{t(L, "addToPool")}</Link>
          ) : (
            <Link href="/tomorrow" className="text-accent font-semibold shrink-0">{t(L, "chooseNow")}</Link>
          )}
        </div>

        <p className="mt-1 text-sm text-muted">
          {locked ? t(L, "lockedNote") : `${t(L, "deadlineIs")} ${lockLabel()}`}
        </p>

        {pool.length === 0 ? (
          <p className="mt-3 text-muted">{t(L, "poolEmpty")}</p>
        ) : (
          POOL_MEALS.map((meal) => {
            const shortlist = pool.filter((p) => p.meal === meal);
            if (shortlist.length === 0) return null;
            const chosen = chosenFor(meal);

            return (
              <div key={meal} className="mt-5">
                <h3 className="text-sm font-bold text-muted uppercase tracking-wide">{t(L, meal)}</h3>

                {chosen.length > 0 ? (
                  <ul className="mt-1.5 grid gap-2">
                    {chosen.map(({ dish }) => (
                      <li key={dish.id}><DishRow dish={dish} lang={L} /></li>
                    ))}
                  </ul>
                ) : locked ? (
                  <>
                    {/* Nobody chose in time: the cook takes any of the dishes she shortlisted. */}
                    <p className="mt-1.5 text-sm font-bold text-accent">{t(L, isCook ? "cookDecides" : "cookDecidesFamily")}</p>
                    <ul className="mt-1.5 grid gap-2">
                      {shortlist.map(({ dish }) => (
                        <li key={dish.id}><DishRow dish={dish} lang={L} /></li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <>
                    <p className="mt-1.5 text-sm text-muted">{t(L, "notChosenYet")}</p>
                    <ul className="mt-1.5 grid gap-2">
                      {shortlist.map(({ dish }) => (
                        <li key={dish.id}><DishRow dish={dish} lang={L} /></li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            );
          })
        )}
      </section>
    </main>
  );
}
