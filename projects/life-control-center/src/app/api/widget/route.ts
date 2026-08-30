import { NextResponse } from "next/server";
import { GET as getChecklist } from "@/app/api/checklist/route";
import { GET as getTodos } from "@/app/api/todos/route";
import { checklistToday, dayPart, type DayPart } from "@/lib/checklist/day";
import type { ChecklistData, ChecklistItem } from "@/lib/checklist/types";
import { badgeCount, type Todo } from "@/lib/todo/types";

/**
 * GET /api/widget — one small JSON for the home-screen widget (Scriptable).
 *
 * iOS gives widgets to native apps only, so a Scriptable script (public/widget.js)
 * fetches this every few minutes and draws a 2×2 tile. Kept tiny and flat on purpose:
 * the script has to stay readable and the widget has ~20 KB of memory headroom.
 */
export const dynamic = "force-dynamic";

const PART_ORDER: Record<DayPart, number> = { morning: 0, afternoon: 1, evening: 2 };
const GREETING: Record<DayPart, string> = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" };

export async function GET() {
  const [c, t] = await Promise.all([getChecklist(), getTodos()]);
  if (!c.ok) return NextResponse.json({ error: "checklist unavailable" }, { status: 502 });
  const data = (await c.json()) as ChecklistData;
  const todos = t.ok ? ((await t.json()) as { todos: Todo[] }).todos : [];

  const today = checklistToday();
  const part = dayPart();
  const items = data.items;
  const counted = items.filter((i) => i.kind !== "habit" && i.source !== "workout");
  const done = counted.filter((i) => i.completedToday).length;

  const partOf = (i: ChecklistItem) => (i.timeOfDay === "anytime" ? null : i.timeOfDay);
  const dueNow = (i: ChecklistItem) => {
    const p = partOf(i);
    return p === null || PART_ORDER[p] <= PART_ORDER[part];
  };
  // Same order as Today's NOW list: this part of day + anything still open from earlier.
  const next = items
    .filter((i) => !i.completedToday && i.kind !== "habit" && i.source !== "workout" && dueNow(i))
    .sort((a, b) => PART_ORDER[partOf(a) ?? part] - PART_ORDER[partOf(b) ?? part] || a.sortOrder - b.sortOrder)
    .slice(0, 3)
    .map((i) => ({ title: i.title, emoji: i.emoji }));

  return NextResponse.json(
    {
      greeting: GREETING[part],
      date: today,
      done,
      total: counted.length,
      streak: data.overallStreak,
      bestStreak: data.bestStreak30 ?? 0,
      next,
      todosDue: badgeCount(todos, today),
      todosWork: badgeCount(todos, today, "work"),
      trainedToday: items.some((i) => i.source === "workout" && i.completedToday),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
