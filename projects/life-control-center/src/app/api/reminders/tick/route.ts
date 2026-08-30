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
 *  due = overdue, or due today with no time (from 09:00; "evening" tasks from 19:00),
 *        or due today with a time that has passed.
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
    if (t.dueDate < today) return hm >= "09:00";
    if (t.dueTime) return hm >= t.dueTime;
    return hm >= (t.evening ? "19:00" : "09:00");
  });
  const toNag = due.filter((t) => !t.lastNaggedAt || now.getTime() - t.lastNaggedAt.getTime() >= NAG_EVERY_MS);
  if (toNag.length === 0) return NextResponse.json({ due: due.length, sent: 0, hm });

  // One notification per list. Everything due in that list is mentioned, so a nag never
  // makes you forget the task it isn't about.
  let sent = 0;
  for (const area of ["personal", "work"] as const) {
    const mine = due.filter((t) => (t.area === "work" ? "work" : "personal") === area);
    if (mine.length === 0 || !toNag.some((t) => (t.area === "work" ? "work" : "personal") === area)) continue;
    const titles = mine.map((t) => t.title).slice(0, 3).join(" · ") + (mine.length > 3 ? ` +${mine.length - 3}` : "");
    const r = await sendToUser(userId, {
      title: area === "work" ? `Work · ${mine.length} to-do${mine.length === 1 ? "" : "s"} due` : `${mine.length} to-do${mine.length === 1 ? "" : "s"} due`,
      body: titles,
      tag: `nag-${area}`,
      url: "/todo",
    });
    sent += r.sent;
  }
  await db.update(todos).set({ lastNaggedAt: now }).where(inArray(todos.id, due.map((t) => t.id)));
  return NextResponse.json({ due: due.length, nagged: toNag.length, sent, hm });
}
