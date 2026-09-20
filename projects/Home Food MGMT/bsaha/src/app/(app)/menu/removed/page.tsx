import Link from "next/link";
import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { dishName, listRemovedDishes } from "@/lib/dishes";
import { thumb } from "@/lib/dishMeta";
import { t } from "@/lib/i18n/dict";
import { MEALS } from "@/db/schema";
import { deleteDish, restoreDish } from "../actions";

/** The library of dishes taken off the menu. Put one back, or delete it for good. */
export default async function RemovedLibrary() {
  const me = (await currentPerson())!;
  if (!me.isAdmin) redirect("/menu");
  const L = me.lang;
  const removed = await listRemovedDishes();

  return (
    <main>
      <Link href="/menu" className="text-muted font-semibold">{t(L, "back")}</Link>
      <h1 className="mt-3 text-3xl font-extrabold">{t(L, "removedLibrary")}</h1>
      <p className="mt-1 text-muted">{t(L, "removedIntro")}</p>

      {removed.length === 0 ? (
        <p className="mt-8 text-muted">{t(L, "removedEmpty")}</p>
      ) : (
        MEALS.map((meal) => {
          const items = removed.filter((d) => d.meal === meal);
          if (items.length === 0) return null;
          return (
            <section key={meal} className="mt-6">
              <h2 className="text-sm font-bold text-muted uppercase tracking-wide">{t(L, meal)} · {items.length}</h2>
              <ul className="mt-2 grid gap-3">
                {items.map((dish) => (
                  <li key={dish.id} className="tile p-2">
                    <div className="flex items-center gap-3">
                      <Link href={`/menu/${dish.slug}`} className="w-20 h-16 rounded-lg bg-accent-soft overflow-hidden shrink-0 relative block">
                        {dish.photoUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb(dish.photoUrl) ?? undefined} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                        )}
                      </Link>
                      <Link href={`/menu/${dish.slug}`} className="min-w-0 block">
                        <span className="block font-bold leading-tight">{dishName(dish, L)}</span>
                        {L !== "ar" && <span className="block text-sm text-muted">{dish.nameLatin}</span>}
                      </Link>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <form action={restoreDish}>
                        <input type="hidden" name="id" value={dish.id} />
                        <button className="chip bg-accent text-accent-ink py-2 px-4 text-sm font-bold">{t(L, "putBack")}</button>
                      </form>
                      <form action={deleteDish}>
                        <input type="hidden" name="id" value={dish.id} />
                        <button className="text-sm text-muted underline">{t(L, "deleteForever")}</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </main>
  );
}
