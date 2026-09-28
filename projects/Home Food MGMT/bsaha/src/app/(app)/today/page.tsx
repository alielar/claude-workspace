import Link from "next/link";
import { currentPerson } from "@/lib/session";
import { getPicks, getPool, isLocked, lockLabel, tomorrowKey } from "@/lib/pool";
import { PLAN_MEALS, settle } from "@/lib/week";
import { dishName } from "@/lib/dishes";
import { listPeople } from "@/lib/people";
import { DishImage } from "@/components/DishImage";
import { t } from "@/lib/i18n/dict";
import { getMyOptions, ownMenuPeople, type MyOption } from "@/lib/mine";
import { MEALS, type Person } from "@/db/schema";
import type { Dish, Lang } from "@/db/schema";

function DishRow({ dish, lang, note, people, dim, big }: { dish: Dish; lang: Lang; note?: string; people?: number; dim?: boolean; big?: boolean }) {
  return (
    <Link href={people ? `/menu/${dish.slug}?people=${people}` : `/menu/${dish.slug}`}
      className={`tile flex items-center gap-3 p-2 ${dim ? "opacity-50" : ""} ${big ? "border-accent ring-2 ring-accent" : ""}`}>
      <span className="w-20 h-16 rounded-lg bg-accent-soft overflow-hidden shrink-0 relative">
        <DishImage photo={dish.photoUrl} />
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-bold leading-tight">{dishName(dish, lang)}</span>
        {note && <span className="block text-xs text-muted mt-0.5">{note}</span>}
      </span>
    </Link>
  );
}

/**
 * Tomorrow at a glance. Lunch and dinner: the two planned options with the votes so far, and once
 * the evening lock has passed, the one that gets cooked. Breakfast: who wants what, for the cook.
 */
export default async function Today() {
  const me = (await currentPerson())!;
  const L = me.lang;
  const day = tomorrowKey();
  const [pool, picks, everyone] = await Promise.all([getPool(day), getPicks(day), listPeople()]);
  const locked = isLocked();
  const isCook = me.role === "cook";
  const canPlan = isCook || me.isAdmin;
  const nameOf = new Map(everyone.map((p) => [p.id, p.name]));
  // Options of the people who eat from a menu of their own: theirs on their screen, all of them on the cook's.
  const myOptions = me.ownMenu ? await getMyOptions(day, me.id) : [];
  const others: { person: Person; options: MyOption[] }[] = isCook
    ? await Promise.all((await ownMenuPeople()).map(async (person) => ({ person, options: await getMyOptions(day, person.id) })))
    : [];
  const optionRows = (options: MyOption[]) => MEALS.map((meal) => {
    const list = options.filter((o) => o.meal === meal);
    return (
      <div key={meal} className="mt-4">
        <h3 className="text-sm font-bold text-muted uppercase tracking-wide">{t(L, meal)}</h3>
        {list.length === 0 ? <p className="mt-1.5 text-sm text-muted">{t(L, "noOptionsYet")}</p> : (
          <ul className="mt-1.5 grid gap-2 md:grid-cols-3">{list.map(({ dish }) => <li key={dish.id}><DishRow dish={dish} lang={L} people={1} /></li>)}</ul>
        )}
      </div>
    );
  });

  const breakfastPicks = picks.filter((p) => p.meal === "breakfast");
  const eatersFor = (meal: string) => Math.max(3, picks.filter((p) => p.meal === meal).length);

  return (
    <main>
      <h1 className="text-3xl font-extrabold">
        {t(L, "hello")} {me.name}
      </h1>

      {me.ownMenu && (
        <section className="mt-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold">{t(L, "myOptions")}</h2>
            <Link href="/tomorrow" className="text-accent font-semibold shrink-0">{t(L, "chooseNow")}</Link>
          </div>
          <p className="mt-1 text-sm text-muted">{t(L, "cookPicksOne")}</p>
          {optionRows(myOptions)}
        </section>
      )}

      {!me.ownMenu && <section className="mt-6">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold">{isCook ? t(L, "tomorrowOrders") : t(L, "tomorrowChoose")}</h2>
          {me.role !== "grocery" && !isCook && (
            <Link href="/tomorrow" className="text-accent font-semibold shrink-0">{t(L, "chooseNow")}</Link>
          )}
        </div>
        <p className="mt-1 text-sm text-muted">
          {locked ? t(L, "lockedNote") : `${t(L, "deadlineIs")} ${lockLabel()}`}
        </p>

        {pool.filter((p) => p.meal !== "breakfast").length === 0 && (
          <p className="mt-3 text-muted">{t(L, "poolEmpty")}</p>
        )}

        {PLAN_MEALS.map((meal) => {
          const options = pool.filter((p) => p.meal === meal);
          if (options.length === 0) return null;
          const { winner, tally } = settle(meal, pool, picks);
          const total = [...tally.values()].reduce((a, b) => a + b, 0);
          return (
            <div key={meal} className="mt-5">
              <h3 className="text-sm font-bold text-muted uppercase tracking-wide">{t(L, meal)}</h3>
              {locked && winner ? (
                <>
                  <p className="mt-1.5 text-sm font-bold text-accent">{t(L, "winner")}</p>
                  <ul className="mt-1.5 grid gap-2">
                    <li><DishRow dish={winner} lang={L} big people={eatersFor(meal)}
                      note={`${tally.get(winner.id) ?? 0} ${t(L, "votes")} · ${eatersFor(meal)} ${t(L, "peopleShort")}`} /></li>
                  </ul>
                </>
              ) : (
                <>
                  {locked && <p className="mt-1.5 text-sm font-bold text-accent">{t(L, isCook ? "cookDecides" : "cookDecidesFamily")}</p>}
                  {!locked && total === 0 && <p className="mt-1.5 text-sm text-muted">{t(L, "notChosenYet")}</p>}
                  <ul className="mt-1.5 grid gap-2">
                    {options.map(({ dish }) => (
                      <li key={dish.id}>
                        <DishRow dish={dish} lang={L} note={total > 0 ? `${tally.get(dish.id) ?? 0} ${t(L, "votes")}` : undefined} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}

        {(isCook || me.isAdmin) && breakfastPicks.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-bold text-muted uppercase tracking-wide">{t(L, "breakfast")}</h3>
            <ul className="mt-1.5 grid gap-2">
              {[...new Map(breakfastPicks.map((p) => [p.dish.id, p.dish])).values()].map((dish) => {
                const who = breakfastPicks.filter((p) => p.dish.id === dish.id).map((p) => nameOf.get(p.personId) ?? "?");
                return <li key={dish.id}><DishRow dish={dish} lang={L} people={who.length} note={who.join(", ")} /></li>;
              })}
            </ul>
          </div>
        )}
      </section>}

      {others.filter((o) => o.options.length > 0).map(({ person, options }) => (
        <section key={person.id} className="mt-8">
          <h2 className="text-lg font-extrabold">{person.name}</h2>
          <p className="mt-1 text-sm font-bold text-accent">{t(L, "cookPicksOne")}</p>
          {optionRows(options)}
        </section>
      ))}

      {canPlan && (
        <section className="mt-8 grid gap-2">
          <Link href="/week" className="btn-soft w-full">{t(L, "planWeek")}</Link>
          <Link href="/grocery" className="btn-ghost w-full">{t(L, "groceryList")}</Link>
        </section>
      )}
    </main>
  );
}
