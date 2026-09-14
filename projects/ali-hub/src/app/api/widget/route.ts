import { NextResponse } from "next/server";
import { GET as getChecklist } from "@/app/api/checklist/route";
import { GET as getTodos } from "@/app/api/todos/route";
import { checklistToday, dayPart, type DayPart } from "@/lib/checklist/day";
import type { ChecklistData, ChecklistItem } from "@/lib/checklist/types";
import { badgeCount, isSleeping, type Todo } from "@/lib/todo/types";

/**
 * GET /api/widget · one small JSON for the home-screen widget (Scriptable).
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

  // Lock-screen widget · strict order (Ali 2026-09-14): today's routine steps for THIS part
  // of the day, then work to-dos, then personal to-dos only once the two above are done.
  const routineNow = items
    .filter((i) => !i.completedToday && i.kind !== "habit" && i.source !== "workout" && (partOf(i) === null || partOf(i) === part))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((i) => ({ t: i.title, w: "now" }));
  const dueTasks = todos
    .filter((t) => !t.deleted && !t.doneAt && !t.someday && !isSleeping(t, today) && (t.area ?? "personal") !== "list" && t.dueDate !== null && t.dueDate <= today);
  const whenLabel = (t: Todo) => (t.dueDate! < today ? "late" : t.dueTime ? t.dueTime : t.evening && part !== "evening" ? "eve" : "today");
  const byUrgency = (a: Todo, b: Todo) => {
    const lateA = a.dueDate! < today ? 0 : 1, lateB = b.dueDate! < today ? 0 : 1;
    if (lateA !== lateB) return lateA - lateB;
    if (lateA === 0 && a.dueDate !== b.dueDate) return a.dueDate! < b.dueDate! ? -1 : 1;
    const evA = a.evening && !a.dueTime ? 1 : 0, evB = b.evening && !b.dueTime ? 1 : 0;
    if (evA !== evB) return evA - evB;
    return (a.dueTime ?? "98:99") <= (b.dueTime ?? "98:99") ? -1 : 1;
  };
  const work = dueTasks.filter((t) => t.area === "work").sort(byUrgency).map((t) => ({ t: t.title, w: whenLabel(t) }));
  const personal = dueTasks.filter((t) => (t.area ?? "personal") === "personal").sort(byUrgency).map((t) => ({ t: t.title, w: whenLabel(t) }));

  // Kept for older copies of the script: the three most urgent tasks, any list.
  const urgent = dueTasks
    .sort((a, b) => {
      const lateA = a.dueDate! < today ? 0 : 1, lateB = b.dueDate! < today ? 0 : 1;
      if (lateA !== lateB) return lateA - lateB;
      if (lateA === 0 && a.dueDate !== b.dueDate) return a.dueDate! < b.dueDate! ? -1 : 1;
      const evA = a.evening && !a.dueTime ? 1 : 0, evB = b.evening && !b.dueTime ? 1 : 0;
      if (evA !== evB) return evA - evB;
      return (a.dueTime ?? "98:99") <= (b.dueTime ?? "98:99") ? -1 : 1;
    })
    .slice(0, 3)
    .map((t) => ({
      t: t.title,
      w: t.dueDate! < today ? "late" : t.dueTime ? t.dueTime : t.evening && part !== "evening" ? "eve" : "today",
    }));

  return NextResponse.json(
    {
      greeting: GREETING[part],
      date: today,
      done,
      total: counted.length,
      streak: data.overallStreak,
      bestStreak: data.bestStreak30 ?? 0,
      next,
      // Same rules as the app badge and the To-do page: due today or overdue, both lists,
      // Vault (sleeping) items excluded. `someday` = the To-do page's Someday buckets, Personal + Work
      // (the 2026-09-14 overcount was sleeping Vault items · they have no date, so they looked like "someday").
      todosDue: badgeCount(todos, today),
      someday: todos.filter((t) => !t.deleted && !t.doneAt && !isSleeping(t, today) && (t.area ?? "personal") !== "list" && (t.someday || !t.dueDate)).length,
      urgent,
      routineNow, work, personal,
      todosWork: badgeCount(todos, today, "work"),
      todosPersonal: badgeCount(todos, today, "personal"),
      trainedToday: items.some((i) => i.source === "workout" && i.completedToday),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
