import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { dishDesc, dishName, formatQty, getDish, ingredientName } from "@/lib/dishes";
import { t } from "@/lib/i18n/dict";
import { deleteDish, saveRecipe, setReviewed } from "../actions";

const AR = { fontFamily: "var(--font-arabic)" } as const;

export default async function DishPage({ params }: { params: Promise<{ slug: string }> }) {
  const me = (await currentPerson())!;
  const { slug } = await params;
  const dish = await getDish(slug);
  if (!dish) notFound();
  const L = me.lang;
  const isCook = me.role === "cook";
  const addedBy = dish.createdBy ? (await db.select({ name: people.name }).from(people).where(eq(people.id, dish.createdBy)))[0]?.name : null;

  const hasRecipe = dish.recipeAr.steps.length > 0;
  const hasIngredients = dish.ingredients.length > 0;

  const recipe = (
    <section className="mt-8" dir="rtl" style={AR}>
      <h2 className="text-xl font-extrabold">{t("ar", "recipe")}</h2>
      <ol className="mt-3 grid gap-3 list-none">
        {dish.recipeAr.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="shrink-0 w-8 h-8 rounded-full bg-accent-soft text-accent font-extrabold flex items-center justify-center">{i + 1}</span>
            <p className={clsx("leading-relaxed", isCook ? "text-xl" : "text-lg")}>{s}</p>
          </li>
        ))}
      </ol>
      {dish.recipeAr.tips.length > 0 && (
        <>
          <h3 className="mt-6 text-lg font-extrabold">{t("ar", "tips")}</h3>
          <ul className="mt-2 grid gap-2 list-disc ps-6">
            {dish.recipeAr.tips.map((s, i) => (
              <li key={i} className={clsx("leading-relaxed", isCook ? "text-xl" : "text-lg")}>{s}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );

  const ingredients = (
    <section className="mt-8">
      <h2 className="text-xl font-extrabold">{t(L, "ingredients")}</h2>
      <p className="text-sm text-muted">{t(L, "forPeople")}</p>
      <ul className="mt-3 tile divide-y divide-line">
        {dish.ingredients.map((i, k) => (
          <li key={k} className="flex justify-between gap-3 px-4 py-2.5">
            <span className={clsx(isCook && "text-lg")}>{ingredientName(i, L)}</span>
            <span className="text-muted shrink-0">{formatQty(i.qty, i.unit, L)}</span>
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <main>
      <Link href={`/menu?meal=${dish.meal}`} className="text-muted font-semibold">{t(L, "back")}</Link>

      <div className="mt-3 tile overflow-hidden">
        <div className="aspect-[4/3] bg-accent-soft relative">
          {dish.photoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={dish.photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
        </div>
      </div>

      <h1 className="mt-4 text-3xl font-extrabold leading-tight" dir={L === "ar" ? "rtl" : "ltr"}>{dishName(dish, L)}</h1>
      {L !== "ar" && <p className="text-lg text-muted">{dish.nameLatin}</p>}
      {!me.simpleUi && dishDesc(dish, L) && <p className="mt-2 text-muted">{dishDesc(dish, L)}</p>}

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="chip bg-accent-soft text-accent py-1 px-3">{t(L, dish.meal)}</span>
        {dish.prepMin + dish.cookMin > 0 && (
          <span className="chip bg-card border border-line text-muted py-1 px-3">{dish.prepMin + dish.cookMin} {t(L, "minutes")}</span>
        )}
        {addedBy && <span className="chip bg-card border border-line text-muted py-1 px-3">{t(L, "customDish")} {addedBy}</span>}
        {me.isAdmin && !dish.reviewed && (
          <span className="chip bg-card border border-line text-muted py-1 px-3">{t(L, "needsReview")}</span>
        )}
      </div>

      {dish.status === "ready" && (
        <>
          {!me.isChild && !me.simpleUi && !isCook && dish.macros.kcal > 0 && (
            <section className="mt-6 tile p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="font-extrabold">{t(L, "nutrition")}</h2>
                <span className="text-xs text-muted">{t(L, "estimates")}</span>
              </div>
              <div className="mt-3 grid grid-cols-5 gap-2 text-center">
                {(
                  [
                    ["kcal", dish.macros.kcal],
                    ["protein", dish.macros.protein_g],
                    ["carbs", dish.macros.carbs_g],
                    ["fat", dish.macros.fat_g],
                    ["fiber", dish.macros.fiber_g],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k}>
                    <div className="text-lg font-extrabold">{Math.round(v)}{k !== "kcal" && <span className="text-xs font-semibold text-muted">g</span>}</div>
                    <div className="text-xs text-muted">{t(L, k)}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {isCook ? (<>{hasRecipe && recipe}{hasIngredients && ingredients}</>) : (<>{hasIngredients && ingredients}{hasRecipe && recipe}</>)}
        </>
      )}

      {dish.photoCredit && (
        <p className="mt-6 text-xs text-muted">
          {t(L, "photoCredit")}: {dish.photoSourceUrl ? <a href={dish.photoSourceUrl} className="underline">{dish.photoCredit}</a> : dish.photoCredit}
          {dish.photoLicense && dish.photoLicense !== "family" && ` · ${dish.photoLicense}`}
        </p>
      )}

      {me.isAdmin && (
        <details className="mt-8 tile p-4">
          <summary className="font-bold cursor-pointer">{t(L, "editRecipe")}</summary>
          <form action={saveRecipe} className="mt-4 grid gap-3" dir="rtl" style={AR}>
            <input type="hidden" name="id" value={dish.id} />
            <label className="grid gap-1">
              <span className="text-sm text-muted">{t("ar", "steps")} · {t("ar", "oneStepPerLine")}</span>
              <textarea name="steps" rows={10} className="input text-lg leading-relaxed" defaultValue={dish.recipeAr.steps.join("\n")} />
            </label>
            <label className="grid gap-1">
              <span className="text-sm text-muted">{t("ar", "tips")} · {t("ar", "oneTipPerLine")}</span>
              <textarea name="tips" rows={5} className="input text-lg leading-relaxed" defaultValue={dish.recipeAr.tips.join("\n")} />
            </label>
            <button className="btn-accent">{t("ar", "save")}</button>
          </form>
          <div className="mt-4 flex items-center justify-between">
            <form action={setReviewed}>
              <input type="hidden" name="id" value={dish.id} />
              <input type="hidden" name="value" value={dish.reviewed ? "0" : "1"} />
              <button className={clsx("chip py-1.5 px-3 text-sm border", dish.reviewed ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line")}>
                {t(L, "reviewed")}
              </button>
            </form>
            <form action={deleteDish}>
              <input type="hidden" name="id" value={dish.id} />
              <button className="text-sm text-muted underline">{t(L, "delete")}</button>
            </form>
          </div>
        </details>
      )}
    </main>
  );
}
