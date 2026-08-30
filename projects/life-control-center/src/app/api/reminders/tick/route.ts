import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/db";
import { todos } from "@/db/schema";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { getUserId } from "@/lib/user";
import { checklistToday } from "@/lib/checklist/day";
import { sendToUser } from "@/lib/push/server";

/**
 * GET /api/reminders/tick?key=APP_KEY — "nag until done" (spec §7c item 3).
 *
 * Called every 5 minutes by an external pinger (Vercel's free cron only runs daily).
 * Finds tasks that are due and not done, and re-sends one notification per list
 * (Personal / Work) every 30 minutes until they're ticked. Quiet 23:00–08:00 (Madrid).
 *
 *  due = a date with a time → once the time has passed;
 *        a date with no time → from 14:00 that day ("evening" tasks from 19:00);
 *        overdue → timed tasks from 09:00, untimed from 14:00.
 */

export const dynamic = "force-dynamic";

const NAG_EVERY_MS = 30 * 60 * 1000;

function madridHM(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!process.env.APP_KEY || key !== process.env.APP_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const hm = madridHM(now);
  if (hm >= "23:00" || hm < "08:00") return NextResponse.json({ quiet: true, hm });

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 500 });
  const today = checklistToday(now);

  const rows = await db.select().from(todos).where(and(
    eq(todos.userId, userId), eq(todos.deleted, false), eq(todos.someday, false), isNull(todos.doneAt), lte(todos.dueDate, today),
  ));

  const due = rows.filter((t) => {
    if (!t.dueDate) return false;
    if (t.dueDate < today) return hm >= (t.dueTime ? "09:00" : "14:00");
    if (t.dueTime) return hm >= t.dueTime;
    return hm >= (t.evening ? "19:00" : "14:00");
  });
  const toNag = due.filter((t) => !t.lastNaggedAt || now.getTime() - t.lastNaggedAt.getTime() >= NAG_EVERY_MS);
  if (toNag.length === 0) return NextResponse.json({ due: due.length, sent: 0, hm });

  // One notification per list. Everything due in that list is mentioned, so a nag never
  // makes you forget the task it isn't about.
  let sent = 0;
  const stamped: number[] = [];
  for (const area of ["personal", "work", "list"] as const) {
    const mine = due.filter((t) => ((t.area === "work" || t.area === "list") ? t.area : "personal") === area);
    if (mine.length === 0 || !toNag.some((t) => ((t.area === "work" || t.area === "list") ? t.area : "personal") === area)) continue;
    const titles = mine.map((t) => t.title).slice(0, 3).join(" · ") + (mine.length > 3 ? ` +${mine.length - 3}` : "");
    const r = await sendToUser(userId, {
      title: area === "list" ? (mine.length === 1 ? `Reminder · ${mine[0].title}` : `${mine.length} doc reminders`)
        : area === "work" ? `Work · ${mine.length} to-do${mine.length === 1 ? "" : "s"} due` : `${mine.length} to-do${mine.length === 1 ? "" : "s"} due`,
      body: titles,
      tag: `nag-${area}`,
      url: "/todo",
    });
    sent += r.sent;
    // The 30-minute clock only starts when a push was actually delivered —
    // a failed send must not silence the task.
    if (r.sent > 0) stamped.push(...mine.map((t) => t.id));
  }
  if (stamped.length) await db.update(todos).set({ lastNaggedAt: now }).where(inArray(todos.id, stamped));
  return NextResponse.json({ due: due.length, nagged: toNag.length, sent, hm });
}
