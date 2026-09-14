import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { listSlimDishes } from "@/lib/slim";
import { browserLabels } from "@/lib/browserLabels";
import { getPool, POOL_CAP, tomorrowKey } from "@/lib/pool";
import { t } from "@/lib/i18n/dict";
import { PoolPicker } from "@/components/PoolPicker";

export default async function PoolPage() {
  const me = (await currentPerson())!;
  if (me.role !== "cook" && !me.isAdmin) redirect("/today");
  const L = me.lang;
  const [all, pool] = await Promise.all([listSlimDishes(), getPool(tomorrowKey())]);
  const dishes = all.filter((d) => d.meal !== "breakfast");

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(L, "tomorrowPool")}</h1>
      <p className="mt-1 text-muted">{t(L, "poolIntro")}</p>
      <div className="mt-4">
        <PoolPicker
          dishes={dishes}
          lang={L}
          labels={browserLabels(L)}
          initial={pool.map((p) => ({ meal: p.meal, id: p.dish.id }))}
          cap={POOL_CAP}
          poolLabels={{ lunch: t(L, "lunch"), dinner: t(L, "dinner"), poolCount: t(L, "poolCount"), poolFull: t(L, "poolFull"), remove: t(L, "delete") }}
        />
      </div>
    </main>
  );
}
