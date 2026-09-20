import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { listSlimDishes } from "@/lib/slim";
import { t } from "@/lib/i18n/dict";
import { LibraryBrowser } from "@/components/LibraryBrowser";

/** How many dishes per meal the menu is meant to hold. */
export const MENU_TARGET = 30;

export default async function LibraryPage() {
  const me = (await currentPerson())!;
  if (!me.isAdmin) redirect("/menu");
  const L = me.lang;
  const dishes = await listSlimDishes();

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(L, "library")}</h1>
      <p className="mt-1 text-muted">{t(L, "libraryIntro")}</p>
      <p className="mt-1 text-sm text-muted">{dishes.length} {t(L, "inLibrary")}</p>

      <div className="mt-4">
        <LibraryBrowser
          dishes={dishes}
          lang={L}
          target={MENU_TARGET}
          labels={{
            breakfast: t(L, "breakfast"), lunch: t(L, "lunch"), dinner: t(L, "dinner"),
            search: t(L, "search"), searchHint: t(L, "searchHint"), results: t(L, "results"),
            noResults: t(L, "noResults"), clear: t(L, "clear"),
            f_protein: t(L, "f_protein"), f_fibre: t(L, "f_fibre"), f_quick: t(L, "f_quick"),
            f_veg: t(L, "f_veg"), f_fish: t(L, "f_fish"), f_chicken: t(L, "f_chicken"), f_meat: t(L, "f_meat"),
            onMenu: t(L, "onMenu"), addToMenu: t(L, "addToMenu"), onMenuCount: t(L, "onMenuCount"),
            target: t(L, "target"), showAll: t(L, "showAll"), showOnMenu: t(L, "showOnMenu"), showOffMenu: t(L, "showOffMenu"),
            clearMeal: t(L, "clearMeal"), clearMealDone: t(L, "clearMealDone"),
            moroccan: t(L, "moroccanMenu"), international: t(L, "mainMenu"),
            sortProtein: t(L, "sortProtein"), sortName: t(L, "sortName"),
          }}
        />
      </div>
    </main>
  );
}
