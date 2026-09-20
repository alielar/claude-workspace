import Link from "next/link";
import { notFound } from "next/navigation";
import clsx from "clsx";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { dishDesc, dishName, getDish } from "@/lib/dishes";
import { t } from "@/lib/i18n/dict";
import { DeleteDishButton } from "@/components/DeleteDishButton";
import { Ingredients } from "@/components/Ingredients";
import { putOnMenu, saveRecipe, setReviewed, setVideo, takeOffMenu } from "../actions";

const AR = { fontFamily: "var(--font-arabic)" } as const;

export default async function DishPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** `people`: how many ordered this dish, set by the cook's orders screen. */
  searchParams: Promise<{ people?: string }>;
}) {
  const me = (await currentPerson())!;
  const { slug } = await params;
  const wanted = Number((await searchParams).people);
  const eaters = Number.isInteger(wanted) && wanted > 0 && wanted <= 20 ? wanted : undefined;
  const dish = await getDish(slug);
  if (!dish) notFound();
  const L = me.lang;
  const isCook = me.role === "cook";
  const addedBy = dish.createdBy ? (await db.select({ name: people.name }).from(people).where(eq(people.id, dish.createdBy)))[0]?.name : null;

  const hasRecipe = dish.recipeAr.steps.length > 0;

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

  const showMacros = !me.isChild && !me.simpleUi && !isCook;
  const ingredients = (
    <Ingredients
      items={dish.ingredients}
      macros={showMacros ? dish.macros : null}
      base={dish.servings}
      lang={L}
      initial={eaters}
      big={isCook}
      labels={{
        ingredients: t(L, "ingredients"), howMany: t(L, "howManyPeople"), forOne: t(L, "forOne"), forN: t(L, "forN"),
        nutrition: t(L, "nutrition"), estimates: t(L, "estimates"), perPerson: t(L, "perPerson"), wholeDish: t(L, "wholeDish"),
        kcal: t(L, "kcal"), protein: t(L, "protein"), carbs: t(L, "carbs"), fat: t(L, "fat"), fiber: t(L, "fiber"),
      }}
    />
  );

  return (
    <main>
      <Link href={!dish.onMenu ? "/library" : `/menu?meal=${dish.meal}`} className="text-muted font-semibold">{t(L, "back")}</Link>

      {!dish.onMenu && (
        <section className="mt-3 tile p-4 border-accent">
          <p className="font-bold text-accent">{t(L, "dishRemoved")}</p>
          <p className="mt-1 text-sm text-muted">{t(L, "dishRemovedHint")}</p>
          {me.isAdmin && (
            <form action={putOnMenu} className="mt-3">
              <input type="hidden" name="id" value={dish.id} />
              <button className="btn-accent w-full">{t(L, "putBack")}</button>
            </form>
          )}
        </section>
      )}

      <div className="mt-3 tile overflow-hidden lg:max-w-2xl">
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
        // The people row, nutrition and ingredients move together. The cook reads the recipe first.
        isCook ? (<>{hasRecipe && recipe}{ingredients}</>) : (<>{ingredients}{hasRecipe && recipe}</>)
      )}

      {dish.videoUrl && (
        <a href={dish.videoUrl} target="_blank" rel="noopener" className="btn-soft w-full mt-8">
          {t(L, "watchVideo")}
        </a>
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
          <form action={setVideo} className="mt-4 flex gap-2" dir="ltr">
            <input type="hidden" name="id" value={dish.id} />
            <input name="video" defaultValue={dish.videoUrl ?? ""} placeholder={t(L, "videoLink")} className="input" inputMode="url" />
            <button className="btn-soft shrink-0">{t(L, "save")}</button>
          </form>
          <div className="mt-4 flex items-center justify-between">
            <form action={setReviewed}>
              <input type="hidden" name="id" value={dish.id} />
              <input type="hidden" name="value" value={dish.reviewed ? "0" : "1"} />
              <button className={clsx("chip py-1.5 px-3 text-sm border", dish.reviewed ? "bg-accent text-accent-ink border-accent" : "bg-card text-muted border-line")}>
                {t(L, "reviewed")}
              </button>
            </form>
            <div className="flex items-center gap-4">
              {dish.onMenu && (
                <form action={takeOffMenu}>
                  <input type="hidden" name="id" value={dish.id} />
                  <button className="text-sm text-muted underline">{t(L, "removeFromMenu")}</button>
                </form>
              )}
              <DeleteDishButton id={dish.id} label={t(L, "deleteForever")} confirmText={t(L, "deleteConfirm")} />
            </div>
          </div>
        </details>
      )}
    </main>
  );
}
