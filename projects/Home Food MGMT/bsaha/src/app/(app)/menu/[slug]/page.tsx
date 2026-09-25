import { notFound } from "next/navigation";
import clsx from "clsx";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { people } from "@/db/schema";
import { currentPerson } from "@/lib/session";
import { dishDesc, dishName, getDish } from "@/lib/dishes";
import { t } from "@/lib/i18n/dict";
import { BackLink } from "@/components/BackLink";
import { DeleteDishButton } from "@/components/DeleteDishButton";
import { Ingredients } from "@/components/Ingredients";
import { putOnMenu, saveRecipe, setReviewed, setVideo, takeOffMenu } from "../actions";

const AR = { fontFamily: "var(--font-arabic)" } as const;

/** Where "Back" lands when there is no history to return to: the screen that opened the dish. */
function backTarget(from: string | undefined, onMenu: boolean, meal: string) {
  switch (from) {
    case "library": return "/library";
    case "week": return "/week";
    case "today": return "/today";
    case "tomorrow": return "/tomorrow";
    case "menu": return `/menu?meal=${meal}`;
    default: return onMenu ? `/menu?meal=${meal}` : "/library";
  }
}

export default async function DishPage({
  params, searchParams,
}: {
  params: Promise<{ slug: string }>;
  /** `people`: how many ordered this dish, set by the cook's orders screen. `from`: the screen that opened it. */
  searchParams: Promise<{ people?: string; from?: string }>;
}) {
  const me = (await currentPerson())!;
  const { slug } = await params;
  const sp = await searchParams;
  const wanted = Number(sp.people);
  const eaters = Number.isInteger(wanted) && wanted > 0 && wanted <= 20 ? wanted : undefined;
  const dish = await getDish(slug);
  if (!dish) notFound();
  const L = me.lang;
  const isCook = me.role === "cook";
  const showMacros = !me.isChild && !me.simpleUi && !isCook;
  const addedBy = dish.createdBy ? (await db.select({ name: people.name }).from(people).where(eq(people.id, dish.createdBy)))[0]?.name : null;

  // The cook and Darija readers get the Darija recipe. English and French readers get theirs
  // when the import has it, otherwise the Darija one as before.
  // French readers get the French steps, else the English original (the USDA text), else Darija.
  const own = L === "ar" || isCook ? null : dish.recipeFr.steps.length && L === "fr" ? { r: dish.recipeFr, lang: "fr" as const }
    : dish.recipeEn.steps.length ? { r: dish.recipeEn, lang: "en" as const } : null;
  const shownRecipe = own ? own.r : dish.recipeAr;
  const recipeLang = own ? own.lang : "ar";
  const hasRecipe = shownRecipe.steps.length > 0;

  const recipe = (
    <section className="mt-8" dir={recipeLang === "ar" ? "rtl" : "ltr"} style={recipeLang === "ar" ? AR : undefined}>
      <h2 className="text-xl font-extrabold">{t(recipeLang, "recipe")}</h2>
      <ol className="mt-3 grid gap-3 list-none">
        {shownRecipe.steps.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="shrink-0 w-8 h-8 rounded-full bg-accent-soft text-accent font-extrabold flex items-center justify-center">{i + 1}</span>
            <p className={clsx("leading-relaxed", isCook ? "text-xl" : "text-lg")}>{s}</p>
          </li>
        ))}
      </ol>
      {shownRecipe.tips.length > 0 && (
        <>
          <h3 className="mt-6 text-lg font-extrabold">{t(recipeLang, "tips")}</h3>
          <ul className="mt-2 grid gap-2 list-disc ps-6">
            {shownRecipe.tips.map((s, i) => (
              <li key={i} className={clsx("leading-relaxed", isCook ? "text-xl" : "text-lg")}>{s}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );

  // The fuller USDA table behind the macros, for adults only.
  const n = dish.nutrition ?? {};
  const more: [string, number | undefined, string][] = [
    [t(L, "satFat"), n.saturated_fat_g, "g"], [t(L, "sugars"), n.sugars_g, "g"],
    [t(L, "sodium"), n.sodium_mg, "mg"], [t(L, "cholesterol"), n.cholesterol_mg, "mg"],
  ];
  const moreNutrition = showMacros && more.some(([, v]) => v !== undefined) && (
    <section className="mt-4 tile p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-extrabold">{t(L, "moreNutrition")}</h2>
        <span className="text-xs text-muted">{t(L, "perServing")}</span>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        {more.filter(([, v]) => v !== undefined).map(([label, v, unit]) => (
          <div key={label}>
            <div className="text-lg font-extrabold">{Math.round(v!)}<span className="text-xs font-semibold text-muted">{unit}</span></div>
            <div className="text-xs text-muted">{label}</div>
          </div>
        ))}
      </div>
      {(dish.foodGroups ?? []).length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-bold text-muted uppercase tracking-wide">{t(L, "foodGroups")}</div>
          <ul className="mt-1.5 grid gap-1">
            {dish.foodGroups.map((g) => (
              <li key={g.group} className="flex justify-between text-sm">
                <span className="font-semibold">{t(L, `g_${g.group}`)}</span>
                <span className="text-muted">{g.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );

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
      <BackLink fallback={backTarget(sp.from, dish.onMenu, dish.meal)} className="text-muted font-semibold">{t(L, "back")}</BackLink>

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
        {(dish.categories ?? []).length > 0
          ? dish.categories.map((c) => <span key={c} className="chip bg-accent-soft text-accent py-1 px-3">{t(L, `c_${c}`)}</span>)
          : <span className="chip bg-accent-soft text-accent py-1 px-3">{t(L, dish.meal)}</span>}
        {dish.rating != null && dish.ratingCount > 0 && !me.simpleUi && (
          <span className="chip bg-card border border-line text-muted py-1 px-3">{dish.rating.toFixed(1)} / 5 · {dish.ratingCount} {t(L, "ratings")}</span>
        )}
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
        isCook ? (<>{hasRecipe && recipe}{ingredients}</>) : (<>{ingredients}{moreNutrition}{hasRecipe && recipe}</>)
      )}

      {dish.videoUrl && (
        <a href={dish.videoUrl} target="_blank" rel="noopener" className="btn-soft w-full mt-8">
          {t(L, "watchVideo")}
        </a>
      )}

      {dish.sourceUrl && (
        <p className="mt-6 text-xs text-muted">
          {t(L, "recipeSource")}: <a href={dish.sourceUrl} className="underline">{dish.sourceText || t(L, "usdaCredit")}</a>
        </p>
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
