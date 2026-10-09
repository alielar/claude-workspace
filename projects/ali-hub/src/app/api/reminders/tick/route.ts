import { NextResponse, after, type NextRequest } from "next/server";
import { ensureWeeklyPodcast, todaysEpisode } from "@/lib/podcast/generate";
import { getWeeklyBrief, briefWeek } from "@/lib/news/weekly";
import { ensureCoachReport, pushCoachReport } from "@/lib/coach/server";
import { pollVideos } from "@/lib/news/videos";
import { pollHighlights } from "@/lib/news/highlights";
import { prewriteIfSessionDay } from "@/lib/mind/server";
import { db } from "@/db";
import { birthdays, todos, userSettings } from "@/db/schema";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { allUserIds, getUserId } from "@/lib/user";
import { getProfile } from "@/lib/profile/server";
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
// The background work (a podcast voicing can take 2 min) must outlive the default limit.
export const maxDuration = 300;

const nagMs = (t: { nagMinutes: number | null }) => (t.nagMinutes ?? 30) * 60 * 1000;

function madridHM(now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!process.env.APP_KEY || key !== process.env.APP_KEY) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const now = new Date();
  const hm = madridHM(now);

  const primaryId = await getUserId();
  if (!primaryId) return NextResponse.json({ error: "no user" }, { status: 500 });
  // Heartbeat · Settings shows "service last ran Xm ago", so a dead pinger is visible.
  await db.update(userSettings).set({ lastReminderTickAt: now }).where(eq(userSettings.userId, primaryId)).catch(() => {});

  // YouTube picks (News): the channel feeds, every 30 min (pollVideos throttles itself) · shared by every account.
  after(async () => { try { await pollVideos(); } catch { /* next tick */ } });
  // Football highlights: the channel feeds only hold the last 15 uploads, so every
  // tick (5 min, all day · matches end near midnight) stores what is new.
  after(async () => { try { await pollHighlights(); } catch { /* next tick */ } });

  // Then every account in turn (2026-10-09 · Ali and his father): the podcast, the coach and the
  // Mind brief by what the account has, the Vault, the birthdays and the nags for everyone.
  const out: Record<string, unknown> = {};
  for (const userId of await allUserIds()) {
    try { out[userId.slice(0, 8)] = await tickUser(userId, now, hm); } catch (e) { out[userId.slice(0, 8)] = `error: ${String((e as Error).message).slice(0, 120)}`; }
  }
  return NextResponse.json({ hm, users: out });
}

async function tickUser(userId: string, now: Date, hm: string): Promise<unknown> {
  const { profile } = await getProfile(userId);
  const has = (s: "train" | "mind") => profile.sections.includes(s);

  // Podcast self-healing (weekly only since 2026-10-04 · the daily episode is retired): the Sunday
  // cron writes the episode; a failed script or voicing is retried here from 09:00 Madrid (after
  // Sunday's own daily brief at 06:00 UTC) · spacing and the attempt cap live inside ensureWeeklyPodcast.
  if (hm >= "09:00" && hm <= "12:30") {
    after(async () => {
      try {
        const prev = briefWeek(checklistToday(now));
        const brief = await getWeeklyBrief(userId, prev.week);
        const wep = brief ? await todaysEpisode(userId, prev.week) : null;
        if (brief && (!wep || wep.status !== "ready")) await ensureWeeklyPodcast(userId, brief);
      } catch { /* next tick retries */ }
    });
  }
  // The coach's weekly report (spec §7c item 15, 2026-10-04): Sunday 20:00 to 22:30 Madrid · write
  // this week's report once (numbers by rule, prose = one askAI call) and push "Your week in training".
  if (has("train") && hm >= "20:00" && hm <= "22:30" && new Date(`${checklistToday(now)}T12:00:00Z`).getUTCDay() === 0) {
    after(async () => {
      try { const r = await ensureCoachReport(userId, checklistToday(now)); if (r) await pushCoachReport(userId, r); } catch { /* next tick */ }
    });
  }
  // Mental Training: from 05:00 on a session day, write today's brief once so it is ready when Ali opens Train → Mind.
  if (has("mind") && hm >= "05:00") after(async () => { try { await prewriteIfSessionDay(userId); } catch { /* next tick */ } });

  if (hm >= "23:00" || hm < "08:00") return { quiet: true };
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
  if (toNag.length === 0) return { due: due.length, sent: 0 };

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
  return { due: due.length, nagged: toNag.length, sent };
}
