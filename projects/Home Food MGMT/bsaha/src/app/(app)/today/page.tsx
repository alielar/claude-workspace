import Link from "next/link";
import { currentPerson } from "@/lib/session";
import { getPool, tomorrowKey } from "@/lib/pool";
import { dishName } from "@/lib/dishes";
import { thumb } from "@/lib/dishMeta";
import { t } from "@/lib/i18n/dict";

export default async function Today() {
  const me = (await currentPerson())!;
  const L = me.lang;
  const pool = await getPool(tomorrowKey());
  const canCurate = me.role === "cook" || me.isAdmin;

  return (
    <main>
      <h1 className="text-3xl font-extrabold">
        {t(L, "hello")} {me.name}
      </h1>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-extrabold">{t(L, "tomorrowPool")}</h2>
          {canCurate && <Link href="/pool" className="text-accent font-semibold">{t(L, "addToPool")}</Link>}
        </div>
        {pool.length === 0 ? (
          <p className="mt-2 text-muted">{t(L, "poolEmpty")}</p>
        ) : (
          <>
            {!canCurate && <p className="mt-1 text-sm text-muted">{t(L, "poolPreview")}</p>}
            {(["lunch", "dinner"] as const).map((meal) => {
              const items = pool.filter((p) => p.meal === meal);
              if (!items.length) return null;
              return (
                <div key={meal} className="mt-3">
                  <h3 className="text-sm font-bold text-muted uppercase tracking-wide">{t(L, meal)}</h3>
                  <ul className="mt-1.5 grid gap-2">
                    {items.map(({ dish }) => (
                      <li key={dish.id}>
                        <Link href={`/menu/${dish.slug}`} className="tile flex items-center gap-3 p-2">
                          <span className="w-16 h-12 rounded-lg bg-accent-soft overflow-hidden shrink-0">
                            {dish.photoUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={thumb(dish.photoUrl) ?? undefined} alt="" className="w-full h-full object-cover" loading="lazy" />
                            )}
                          </span>
                          <span className="font-bold leading-tight">{dishName(dish, L)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </>
        )}
      </section>

      <p className="mt-8 text-sm text-muted">{t(L, me.role === "cook" ? "ordersSoon" : "picksSoon")}</p>
    </main>
  );
}
