import { redirect } from "next/navigation";
import { currentPerson } from "@/lib/session";
import { listSlimDishes } from "@/lib/slim";
import { browserLabels } from "@/lib/browserLabels";
import { dayLabel, getWeekPlan, PLAN_MEALS, PLAN_PER_MEAL, weekDays } from "@/lib/week";
import { t } from "@/lib/i18n/dict";
import { WeekPlanner } from "@/components/WeekPlanner";

/** The cook or an admin plans the coming week: two options for lunch and two for dinner every day. */
export default async function WeekPage() {
  const me = (await currentPerson())!;
  if (me.role !== "cook" && !me.isAdmin) redirect("/today");
  const L = me.lang;
  const days = weekDays();
  const [all, plan] = await Promise.all([listSlimDishes(), getWeekPlan(days)]);
  const dishes = all.filter((d) => d.onMenu && d.inMain);

  return (
    <main>
      <h1 className="text-3xl font-extrabold">{t(L, "weekPlan")}</h1>
      <p className="mt-1 text-muted">{t(L, "weekIntro")}</p>
      <div className="mt-4">
        <WeekPlanner
          dishes={dishes}
          lang={L}
          days={days}
          dayLabels={Object.fromEntries(days.map((d) => [d, dayLabel(d, L)]))}
          initial={plan.map((s) => ({ day: s.day, meal: s.meal, id: s.dish.id }))}
          perMeal={PLAN_PER_MEAL}
          meals={PLAN_MEALS}
          browserLabels={browserLabels(L)}
          labels={{
            lunch: t(L, "lunch"), dinner: t(L, "dinner"), fillWeek: t(L, "fillWeek"), clearWeek: t(L, "clearWeek"),
            clearWeekConfirm: t(L, "clearWeekConfirm"), addOption: t(L, "addOption"), remove: t(L, "delete"),
            close: t(L, "close"), slotsFull: t(L, "slotsFull"), filled: t(L, "filled"),
          }}
        />
      </div>
    </main>
  );
}
