import Link from "next/link";
import { MEALS, type Meal } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { t } from "@/lib/i18n/dict";
import { addDish } from "../actions";

export default async function AddDish({ searchParams }: { searchParams: Promise<{ meal?: string }> }) {
  const me = (await currentPerson())!;
  const sp = await searchParams;
  const meal: Meal = MEALS.includes(sp.meal as Meal) ? (sp.meal as Meal) : "lunch";
  return (
    <main>
      <Link href={`/menu?meal=${meal}`} className="text-muted font-semibold">
        {t(me.lang, "back")}
      </Link>
      <h1 className="mt-3 text-3xl font-extrabold">{t(me.lang, "addDish")}</h1>

      <form action={addDish} className="mt-6 grid gap-4">
        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-muted">{t(me.lang, "dishName")}</span>
          <input name="name" className="input text-lg" required maxLength={80} autoFocus />
        </label>
        <div className="grid grid-cols-3 gap-2">
          {MEALS.map((m) => (
            <label key={m} className="tile px-3 py-3 flex items-center justify-center gap-2 font-semibold text-sm">
              <input type="radio" name="meal" value={m} defaultChecked={m === meal} className="accent-accent" />
              {t(me.lang, m)}
            </label>
          ))}
        </div>
        <label className="grid gap-1.5">
          <span className="text-sm font-bold text-muted">{t(me.lang, "photoLink")}</span>
          <input name="photo" className="input" inputMode="url" placeholder="https://" />
        </label>
        <button className="btn-accent">{t(me.lang, "save")}</button>
      </form>
    </main>
  );
}
