import { NextResponse, after, type NextRequest } from "next/server";
import { ensureTodaysPodcast, todaysEpisode } from "@/lib/podcast/generate";
import { pollHighlights } from "@/lib/news/highlights";
import { db } from "@/db";
import { birthdays, todos, userSettings } from "@/db/schema";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { getUserId } from "@/lib/user";
import { checklistToday } from "@/lib/checklist/day";
import { sendToUser } from "@/lib/push/server";
import { ensureBirthdayTables } from "@/lib/birthdays/server";
import { daysUntil, fmtDaysUntil, nextOccurrence, turningAge } from "@/lib/birthdays/types";

/**
 * GET /api/reminders/tick?key=APP_KEY · "nag until done" (spec §7c item 3).
 *
 * Called every 5 minutes by an external pinger (Vercel's free cron only runs daily).
 * Finds tasks that are due and not done, and re-sends one notification per list
 * (Personal / Work) at each task's own cadence (5/10/15/30 min · default 30) until ticked. Quiet 23:00–08:00 (Madrid).
 *
 *  due = a date with a time → once the time has passed · nags at the task's own
 *        cadence until done (Ali's explicit choice, untouched);
 *        a date with no time → DEFAULT REMINDER (2026-09-06): from 09:00 that day
 *        ("evening" tasks from 19:00), every 30 min for the first 2 hours, then
 *        hourly, and untimed tasks go silent from 21:00 until the next morning ·
 *        all-day 30-min nagging trains you to ignore the notifications;
 *        overdue → from 09:00 with the same backoff.
 */

export const dynamic = "force-dynamic";

const nagMs = (t: { nagMinutes: number | null }) => (t.nagMinutes ?? 30) * 60 * 1000;

function madridHM(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!process.env.APP_KEY || key !== process.env.APP_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const hm = madridHM(now);

  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "no user" }, { status: 500 });
  // Heartbeat · Settings shows "service last ran Xm ago", so a dead pinger is visible.
  await db.update(userSettings).set({ lastReminderTickAt: now }).where(eq(userSettings.userId, userId)).catch(() => {});

  // Podcast self-healing: if this morning's episode isn't ready yet (Vercel cron
  // missed, or the free voice failed), retry in the background — spacing and the
  // attempt cap live inside ensureTodaysPodcast. Never a silent morning.
  if (hm >= "06:30" && hm <= "10:30") {
    after(async () => {
      try {
        const ep = await todaysEpisode(userId);
        if (!ep || (ep.status !== "ready")) await ensureTodaysPodcast(userId);
      } catch { /* next tick retries */ }
    });
  }

  // Football highlights: the channel feeds only hold the last 15 uploads, so every
  // tick (5 min, all day · matches end near midnight) stores what is new.
  after(async () => { try { await pollHighlights(); } catch { /* next tick */ } });

  if (hm >= "23:00" || hm < "08:00") return NextResponse.json({ quiet: true, hm });
  const today = checklistToday(now);

  // Vault (far-future items): the wake day has come · one push, then the item
  // simply becomes a normal task/doc again (wakeDate cleared = promoted).
  const waking = await db.select().from(todos).where(and(
    eq(todos.userId, userId), eq(todos.deleted, false), isNull(todos.doneAt), lte(todos.wakeDate, today),
  ));
  if (waking.length) {
    const titles = waking.map((t) => t.title).slice(0, 3).join(" · ") + (waking.length > 3 ? ` +${waking.length - 3}` : "");
    await sendToUser(userId, {
      title: waking.length === 1 ? "Back from the Vault" : `${waking.length} back from the Vault`,
      body: titles, tag: "vault", url: "/todo",
    });
    await db.update(todos).set({ wakeDate: null }).where(inArray(todos.id, waking.map((t) => t.id)));
  }

  // Birthdays: one heads-up push per person, once per year, when the date enters its
  // own reminder window (default 3 days ahead, editable per person) · never repeats
  // for that occurrence (notifiedYear), never nags.
  await ensureBirthdayTables().catch(() => {});
  const bdayRows = await db.select().from(birthdays).where(and(eq(birthdays.userId, userId), eq(birthdays.deleted, false))).catch(() => []);
  for (const b of bdayRows) {
    const occYear = Number(nextOccurrence(b, today).slice(0, 4));
    if (b.notifiedYear === occYear) continue;
    const days = daysUntil(b, today);
    if (days > b.remindDaysBefore) continue;
    const age = turningAge(b, today);
    await sendToUser(userId, {
      title: `${b.name}'s birthday ${fmtDaysUntil(days).toLowerCase()}`,
      body: age !== null ? `Turns ${age}` : "Don't forget to reach out.",
      tag: `birthday-${b.clientId}-${occYear}`, url: "/birthdays",
    });
    await db.update(birthdays).set({ notifiedYear: occYear }).where(eq(birthdays.id, b.id));
  }

  const rows = await db.select().from(todos).where(and(
    eq(todos.userId, userId), eq(todos.deleted, false), eq(todos.someday, false), isNull(todos.doneAt), lte(todos.dueDate, today),
  ));

  const hmToMin = (x: string) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3, 5));
  const nowMin = hmToMin(hm);

  const dueFrom = (t: typeof rows[number]) => {
    if (t.dueDate! < today) return "09:00";
    if (t.dueTime) return t.dueTime;
    return t.evening ? "19:00" : "09:00";
  };
  // Sleeping items (a future wakeDate) never nag, whatever their due date.
  const due = rows.filter((t) => t.dueDate && hm >= dueFrom(t) && !(t.wakeDate && t.wakeDate > today));

  // Untimed tasks: 30 min cadence for the first 2 hours, hourly after, silent from
  // 21:00. Tasks with an explicit time keep their chosen cadence all day.
  const nagIntervalMs = (t: typeof rows[number]): number => {
    if (t.dueTime) return nagMs(t);
    if (hm >= "21:00") return Infinity;
    const sinceDue = nowMin - hmToMin(dueFrom(t));
    return sinceDue > 120 ? Math.max(nagMs(t), 60 * 60 * 1000) : nagMs(t);
  };
  const toNag = due.filter((t) => {
    const interval = nagIntervalMs(t);
    if (!Number.isFinite(interval)) return false;
    return !t.lastNaggedAt || now.getTime() - t.lastNaggedAt.getTime() >= interval;
  });
  if (toNag.length === 0) return NextResponse.json({ due: due.length, sent: 0, hm });

  // One notification per list and device class. Everything due in that list is mentioned,
  // so a nag never makes you forget the task it isn't about.
  // EVERY reminder goes to EVERY device (Ali 2026-09-15: "default to both phone and laptop
  // always") · the per-task notify_target chooser is gone from the sheet and the column, which
  // still exists on old rows, is deliberately ignored here.
  let sent = 0;
  const stamped: number[] = [];
  const areaOf = (t: typeof rows[number]) => ((t.area === "work" || t.area === "list") ? t.area : "personal");
  for (const area of ["personal", "work", "list"] as const) {
    for (const target of ["phone", "laptop"] as const) {
      const mine = due.filter((t) => areaOf(t) === area);
      if (mine.length === 0 || !toNag.some((t) => areaOf(t) === area)) continue;
      const titles = mine.map((t) => t.title).slice(0, 3).join(" · ") + (mine.length > 3 ? ` +${mine.length - 3}` : "");
      const r = await sendToUser(userId, {
        title: area === "list" ? (mine.length === 1 ? `Reminder · ${mine[0].title}` : `${mine.length} doc reminders`)
          : area === "work" ? `Work · ${mine.length} to-do${mine.length === 1 ? "" : "s"} due` : `${mine.length} to-do${mine.length === 1 ? "" : "s"} due`,
        body: titles,
        tag: `nag-${area}`,
        url: "/todo",
      }, target);
      sent += r.sent;
      // The 30-minute clock only starts when a push was actually delivered —
      // a failed send must not silence the task.
      if (r.sent > 0) stamped.push(...mine.map((t) => t.id));
    }
  }
  if (stamped.length) await db.update(todos).set({ lastNaggedAt: now }).where(inArray(todos.id, stamped));
  return NextResponse.json({ due: due.length, nagged: toNag.length, sent, hm });
}
